# Deploying the click

## GitHub Pages cannot host this

Pages serves static files. The swap needs two things it cannot do:

- `/play` has to *change something* and then redirect.
- `/scene` has to return different bytes depending on whether that something
  changed.

There is no static formulation of either. Pages also sets its own caching
headers, and `no-store` is the only reason GitHub's proxy ever comes back for
the image - a cached hero image means the click does nothing.

Pages does have a job here, just not this one: it is the natural home for
`index.html`, the real cursor-following version. Enable it and link to it from
the README. Static hosting is exactly right for that, and it costs nothing.

## Vercel works, with one thing to know

`/play` and `/scene` are separate invocations that may land on different
instances, so **the flag cannot live in a variable**. `api/_shared.mjs` keeps it
in Redis when one is configured and falls back to memory when it is not.

The fallback is honest about what it is: it works only while a single instance
stays warm. For a quiet profile that is most of the time, so it is fine for a
first deploy - but a click that lands on a cold instance does nothing, and you
will not be able to tell that from a click that worked.

For the real thing, add a free Upstash Redis (Vercel KV is the same service)
and set either pair of names - both are read:

```
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
KV_REST_API_URL        / KV_REST_API_TOKEN
```

One key, one TTL, no schema. `/play` writes `eyes:playing=1 EX=12`; `/scene`
reads it; the window closes because the key expires.

## Deploying

Project root is `eyes/`. From the repo:

```bash
npx vercel --cwd eyes            # preview
npx vercel --cwd eyes --prod
```

Set `PROFILE_URL=https://github.com/qvd808` in the project's environment, or
the click sends visitors to whatever the default is. `vercel.json` maps `/play`
and `/scene` onto the functions and bundles the image assets alongside them.

Then point the README at it:

```html
<a href="https://YOUR-APP.vercel.app/play"><img src="https://YOUR-APP.vercel.app/scene" width="100%" alt="..."></a>
```

## What it costs to run

`no-store` is load-bearing, so every profile view is one function invocation
plus the poster over the wire. Nothing here is cacheable by design.

| poster | width | per view | at README width |
|---|---|---|---|
| 2200px q82 | full capture | 243 KB | 2.47x |
| **1650px q82** | **current** | **142 KB** | **1.85x** |
| 1364px q80 | | 95 KB | 1.53x |
| 1100px q80 | | 65 KB | 1.24x |

The animation is the other half: 376 KB, 276 KB gzipped, and it only moves when
somebody clicks. Both are built by `tools/build_tiles.py` and
`tools/build_svg.py --once --light`.

Vercel's Hobby tier is 100k invocations a month, which a profile README will not
trouble. The thing to watch is not the quota but the shape of the failure: if
the function is down, the top of your profile is a broken image on every view.
That risk is the price of the image changing at all.
