vcl 4.1;

import std;

# Same VCL logic as sudoperiba's config/varnish/default.vcl, adapted for
# running on the Hetzner box (next to Caddy) instead of the Istanbul VM.
# The only real difference is these two backends: they used to be Docker
# service names reachable on Istanbul's local network, and now have to be
# reached over Tailscale since Varnish moved to a different machine.
#
# 100.102.93.90 is the Istanbul VM's Tailscale IP. VCL is loaded as static
# text by varnishd — it has no env-var substitution — so this is hardcoded
# rather than templated, same as the equivalent entry in sudoperiba's
# config/prometheus.yml. If this IP ever changes, update it here directly.
# Also confirm storefront-gateway/rustfs-proxy are actually bound on
# Istanbul's Tailscale interface (not just 0.0.0.0 inside its Docker
# network) — see sudoperiba's docker-compose.yaml for those services.
#
# Port 8094 here, NOT 8092 — storefront-gateway listens on 8092 inside
# its own container, but its host-side Tailscale port had to move to
# 8094 because notification-service already claims host port 8092 on
# that VM (a real collision that broke a deploy). This is the host-side
# port, matching docker-compose.yaml's "100.102.93.90:8094:8092" mapping.
backend frontend {
    .host = "100.102.93.90";
    .port = "8094";
    # 1s not 5s: a healthy backend over Tailscale still answers connect()
    # near-instantly under normal conditions — 5s was letting requests sit
    # in connect() for the full timeout during an Istanbul-side frontend/
    # storefront-gateway deploy restart, producing multi-second /catalog
    # latency spikes that were mistaken for a request-processing slowdown.
    .connect_timeout = 1s;
    .first_byte_timeout = 60s;
    .between_bytes_timeout = 10s;
    # storefront-gateway has no dedicated health endpoint; /robots.txt is a
    # cheap static route on frontend that it proxies through without
    # touching any other downstream service, so the probe reflects whether
    # the whole hop (gateway + frontend) is actually up.
    .probe = {
        .url = "/robots.txt";
        .interval = 2s;
        .timeout = 1s;
        .window = 3;
        .threshold = 2;
    }
}

# Port 9005 here, NOT 80 — rustfs-proxy's original "0.0.0.0:80:80"
# Tailscale-specific binding collided with Dokploy's own Traefik, which
# binds 0.0.0.0:80 host-wide on Istanbul (a wildcard binding blocks ANY
# other binding on the same port, even a specific-IP one). rustfs-proxy
# already exposed "9005:80" on 0.0.0.0, which covers the Tailscale
# interface too, so this backend just uses that port instead of a
# separate Tailscale-only mapping.
backend minio_static {
    .host = "100.102.93.90";
    .port = "9005";
    .connect_timeout = 5s;
    .first_byte_timeout = 60s;
    .between_bytes_timeout = 10s;
}

# ACL for PURGE requests. "localhost" covers Caddy/anything local on this
# box. varnish-invalidator stays on Istanbul (keeps its local Postgres/
# read-modulith access) and now PURGEs across Tailscale, so its Tailscale
# IP needs to be listed explicitly here — it's no longer on the
# 172.20.0.0/16 Docker subnet that covered it before the move.
acl purge {
    "localhost";
    "100.102.93.90";
    // GitHub Actions reaches Varnish through the Tailscale network. Tailscale
    // ACLs still restrict which CI identity can join this network.
    "100.64.0.0"/10;
    // Varnish is now reached via a published port (100.115.175.6:6081)
    // for PURGE traffic, not container-to-container on the compose
    // network — a request arriving through Docker's iptables DNAT path
    // for a host-published port normally keeps the real external source
    // IP, so 100.102.93.90 above should be what client.ip shows. This
    // /12 is added defensively in case Docker's userland-proxy path is
    // in play instead and rewrites the source to something in its
    // default bridge range — remove once a real purge from
    // varnish-invalidator is confirmed working end-to-end (check
    // `docker logs varnish` for the actual client.ip on a 403, if any).
    "172.16.0.0"/12;
}

sub vcl_recv {
    # Route /static/images/* to MinIO (product images)
    if (req.url ~ "^/static/images/") {
        set req.backend_hint = minio_static;
        # Strip /static prefix before sending to minio-proxy
        set req.url = regsub(req.url, "^/static", "");
    } else {
        # Everything else (including /static/default/css, /static/default/js) goes to frontend
        set req.backend_hint = frontend;
    }

    # Health-aware grace: while the backend is healthy, only tolerate a few
    # seconds of staleness (covers brief blips). Once the probe marks it
    # sick (e.g. mid-restart during an Istanbul-side deploy), extend to 60s
    # so in-flight requests get the last-known-good cached page instead of
    # piling up on a backend that isn't accepting connections yet.
    if (std.healthy(req.backend_hint)) {
        set req.grace = 10s;
    } else {
        set req.grace = 60s;
    }

    # Handle PURGE requests first
    if (req.method == "PURGE") {
        if (!client.ip ~ purge) {
            return (synth(403, "Not allowed"));
        }
        return (purge);
    }

    # Deployments can invalidate the entire cache; manual requests can
    # still target one hostname. Both operations require the purge ACL.
    if (req.method == "BAN") {
        if (!client.ip ~ purge) {
            return (synth(403, "Not allowed"));
        }
        if (req.http.X-Cache-Ban-Scope == "all") {
            ban("obj.status != 0");
            return (synth(200, "Banned all"));
        }
        if (!req.http.Host) {
            return (synth(400, "Host header required"));
        }
        ban("obj.http.X-Cache-Host == " + req.http.Host);
        return (synth(200, "Banned"));
    }

    # Advertise ESI capability to the backend so it emits <esi:include> only
    # when we can actually process it (the frontend inlines fragments otherwise).
    set req.http.Surrogate-Capability = "varnish=ESI/1.0";

    # Every other /fragment/ route (e.g. recently-viewed) is per-visitor and
    # must never be cached — must carry the vid cookie. card-actions/
    # quick-view are carved out below (after Accept-Encoding normalization),
    # since they carry no visitor data (pure product title/price/variants/
    # stock) and are safe to cache short-TTL (see vcl_backend_response) —
    # they're fetched on every catalog quick-add tap and would otherwise pay
    # a full origin round-trip on each one. Stock is revalidated server-side
    # at order creation regardless of what a stale cached fragment showed,
    # so a few seconds of staleness here doesn't enable overselling. Not
    # purged by variant stock/price events today (varnish-invalidator's
    # TOPICS has no variant.* entries) — only by the product.* events it
    # already subscribes to — so a variant-only edit relies on the 10s TTL
    # alone, not an active purge.
    if (req.url ~ "^/fragment/" && req.url !~ "^/fragment/(card-actions|quick-view)/") {
        return (pass);
    }

    # Only cache GET and HEAD requests
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }

    # Don't cache API endpoints (product view tracking, wishlist toggles)
    if (req.url ~ "^/m/") {
        return (pass);
    }

    # Don't cache session-dependent / personalized pages
    if (req.url ~ "^/(wishlist|cart|checkout|registruj_se|register)$") {
        return (pass);
    }

    # Don't cache if user has an active session cookie (actix-session uses cookie named "id")
    if (req.http.Cookie ~ "(^|;\s*)id=") {
        return (pass);
    }

    # Normalize Accept-Encoding — Varnish only handles gzip on backend fetch;
    # collapse br/zstd/deflate to gzip so all browsers get compressed responses
    if (req.http.Accept-Encoding) {
        if (req.http.Accept-Encoding ~ "gzip") {
            set req.http.Accept-Encoding = "gzip";
        } else {
            unset req.http.Accept-Encoding;
        }
    }

    return (hash);
}

sub vcl_backend_response {
    # Keep the request hostname on the object so a deployment BAN can evict
    # every cached URL for one tenant without affecting other hostnames.
    set beresp.http.X-Cache-Host = bereq.http.Host;

    # Remove Set-Cookie from cacheable responses
    # The vid cookie doesn't affect HTML content for non-authenticated users

    # Enable ESI processing only when the backend opted in (Surrogate-Control),
    # i.e. it emitted <esi:include> tags. Works for cached and passed responses.
    if (beresp.http.Surrogate-Control ~ "ESI/1.0") {
        unset beresp.http.Surrogate-Control;
        set beresp.do_esi = true;
    }

    if (beresp.status == 200) {
        # Upper bound on how long an object may be served stale; the actual
        # per-request grace window is set in vcl_recv via req.grace
        # (health-aware: 10s normally, 60s while the backend probe is down).
        set beresp.grace = 60s;

        # Cache homepage for 10 minutes
        if (bereq.url == "/") {
            set beresp.ttl = 10m;
            set beresp.http.Cache-Control = "public, max-age=600";
            unset beresp.http.Set-Cookie;
        }

        # Cache product pages for 1 hour
        if (bereq.url ~ "^/product/") {
            set beresp.ttl = 1h;
            set beresp.http.Cache-Control = "public, max-age=3600";
            unset beresp.http.Set-Cookie;
        }

        # Cache card-actions/quick-view fragments briefly — short enough that
        # a stock change (order placed, admin edit) is only visible stale for
        # a few seconds, actively purged on product.* events besides (see
        # varnish-invalidator; variant-only events aren't subscribed to
        # today, so those rely on this TTL alone), and order creation
        # re-validates stock server-side regardless, so this TTL is a
        # latency optimization only, not something correctness depends on.
        if (bereq.url ~ "^/fragment/(card-actions|quick-view)/") {
            set beresp.ttl = 10s;
            set beresp.http.Cache-Control = "public, max-age=10";
            unset beresp.http.Set-Cookie;
        }

        # Cache category/brand/search pages — short TTL if result was empty
        if (bereq.url ~ "^/catalog/") {
            if (beresp.http.X-Empty-Result == "1") {
                set beresp.ttl = 5m;
                set beresp.http.Cache-Control = "public, max-age=300";
                unset beresp.http.X-Empty-Result;
                unset beresp.http.Set-Cookie;
            } else {
                set beresp.ttl = 30m;
                set beresp.http.Cache-Control = "public, max-age=1800";
                unset beresp.http.Set-Cookie;
            }
        }

        # Cache MinIO images for 7 days (they have /images/ in the URL after stripping /static)
        if (bereq.url ~ "^/images/") {
            set beresp.ttl = 7d;
            set beresp.http.Cache-Control = "public, max-age=604800, immutable";
            unset beresp.http.Set-Cookie;
        }

        # Unversioned favicons - short TTL since the filename never changes
        # on update (no ?v= cache-buster like the other static assets). Must
        # be checked before the general CSS/JS/font/image rules below since
        # those match on file extension regardless of the /favicon path.
        if (bereq.url ~ "^/static/favicon") {
            set beresp.ttl = 1h;
            set beresp.http.Cache-Control = "public, max-age=3600";
            unset beresp.http.Set-Cookie;
        } else {
            # CSS/JS/fonts/icons carry a ?v={ASSET_VERSION} cache-buster that
            # changes on every deploy, so the URL itself is immutable - safe
            # to cache for a year. bereq.url includes the query string, so
            # match on the path component (before "?") for the extension.
            if (bereq.url ~ "^/static/.*\.(css|js|woff|woff2|ttf|eot|svg|ico|png|gif|webp)(\?.*)?$") {
                set beresp.ttl = 365d;
                set beresp.http.Cache-Control = "public, max-age=31536000, immutable";
                unset beresp.http.Set-Cookie;
            }
        }
    }

    # Don't cache errors
    if (beresp.status >= 400) {
        set beresp.ttl = 0s;
        set beresp.uncacheable = true;
        return (deliver);
    }

    return (deliver);
}

sub vcl_deliver {
    # Add cache status headers for debugging
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
        set resp.http.X-Cache-Hits = obj.hits;
    } else {
        set resp.http.X-Cache = "MISS";
    }

    # Add TTL info for debugging
    set resp.http.X-Cache-TTL = obj.ttl;

    # Remove backend server info for security
    unset resp.http.Server;
    unset resp.http.X-Powered-By;
    unset resp.http.X-Cache-Host;

    return (deliver);
}

sub vcl_purge {
    return (synth(200, "Purged"));
}
