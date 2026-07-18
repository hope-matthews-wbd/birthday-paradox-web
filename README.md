# Content Breadth vs. Depth Simulation

A dependency-free browser simulation for exploring how content-catalog breadth and depth affect recommendation repetition.

The tool compares a synthetic popularity-weighted recommendation strategy (labeled **Personalized Algo / SRA v1** in the UI) with a strategy that assigns equal probability to each parent title (labeled **Totally Random Algo**). It reports repetition at both the individual Short and parent-title levels.

> The repository name refers to the collision intuition behind the birthday paradox. The application is a Monte Carlo recommendation-overlap simulator, not a calculator for the classic birthday-probability problem.

## What the tool measures

The application has three views:

- **Shorts Duplication** measures how many exact Shorts in a session also occur in the selected lookback sessions.
- **Parent Title Repetition** measures:
  - distinct parent titles in each session;
  - parent titles repeated across lookback sessions; and
  - repeated parent titles within one session, including the percentage of sessions containing two or more clips from at least one title.
- **Methodology** explains the formulas, prediction process, assumptions, and engineering validation checks in the deployed UI.

Each view compares the personalized and uniform-title strategies with summary statistics and histograms. The Shorts view also includes cumulative charts showing how many simulated sessions have an exact-duplicate count at or below each threshold.

## Run locally

There are no dependencies or build step. Serve the repository over HTTP from its root:

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Serving over HTTP is preferred to opening `index.html` directly because browser security behavior for Blob-backed Web Workers can vary for `file://` pages.

## Use the simulator

Configure the exact catalog composition and session assumptions. The catalog editor starts with the supplied 479-title / 807-clip distribution, and its totals update as rows change.

| Input | Meaning | Default |
| --- | --- | ---: |
| Clips per title | Exact number of clips belonging to titles in one catalog row | 1-6 |
| Number of titles | Exact number of titles having that row's clip count | 479 total |
| Shorts Served in Session | Number of unique Shorts selected for one simulated session | 25 |
| Lookback # of Sessions | Number of other sessions used for the overlap comparison | 3 |

The catalog starts as a compact accordion row showing its title and clip totals. Select the chevron to edit the distribution, use **Add row** or **Remove** as needed, and then select **Run simulation**. The catalog is shared by both views. The Shorts view runs automatically when the page loads; the Parent Title view runs the first time its tab is opened.

Two advanced values are currently fixed by hidden form inputs:

- 1,000 simulated sessions per strategy
- random seed `42`

The fixed seed makes a run reproducible for the same inputs.

## How it works

At a high level, the application:

1. Expands the exact catalog table into individual parent titles, ordered from most clips to fewest.
2. Creates parent-title probabilities using either the RFY rank-weighted or uniform distribution.
3. Splits each title's probability equally among its exact number of Shorts.
4. Generates sessions by drawing Gamma weights and selecting the highest-ranked unique Shorts.
5. Counts exact-Short or parent-title overlap against other simulated sessions.
6. Sends progress and results from Web Workers to the UI, which draws distribution and cumulative charts with the Canvas API.

See [docs/MODEL.md](docs/MODEL.md) for the full calculation specification, worked example, metric definitions, prediction semantics, assumptions, and engineering validation checklist. The essential material is also available in the application's **Methodology** tab.

## Project structure

```text
.
├── README.md          # Project overview and operating instructions
├── docs/
│   └── MODEL.md       # Simulation methodology and limitations
├── index.html         # UI, styles, workers, model, and chart rendering
├── netlify/
│   └── edge-functions/
│       └── basic-auth.js  # Production HTTP Basic Authentication gate
├── netlify.toml       # Netlify static-site configuration
└── tests/
    ├── basic-auth.test.mjs     # Authentication response checks
    └── catalog-model.test.js   # Dependency-free model regression checks
```

The project deliberately uses a single HTML file and browser-native APIs:

- no framework or third-party runtime libraries;
- no package manager or compilation step;
- no application backend, database, or network requests; and
- all simulation data remains in the visitor's browser.

## Deployment

Production: [https://birthday-paradox-web.netlify.app](https://birthday-paradox-web.netlify.app)

The included `netlify.toml` publishes the repository root:

```toml
[build]
  publish = "."
```

Connect the repository to Netlify and deploy it as a static site. No build command is required.

### Access control

The deployed site is protected by HTTP Basic Authentication in a Netlify Edge Function. Credentials are read from Functions-scoped Netlify environment variables and must never be committed to Git:

```sh
netlify env:set SITE_BASIC_AUTH_USERNAME "<username>" --scope functions --secret
netlify env:set SITE_BASIC_AUTH_PASSWORD "<password>" --scope functions --secret
```

Set the variables for every deploy context that should be protected. Netlify applies Edge Function environment-variable changes at deploy time, so publish a new deploy after changing either credential. The local static server remains ungated; use the authentication test below to verify the gate without storing real credentials locally.

All runtime paths are relative and the simulation makes no API calls, so the same code runs locally and on a public static origin. The workers are created from in-page Blob URLs. Netlify's default headers permit this; if a different host adds a Content Security Policy, its `worker-src` directive must allow `blob:` and its script policy must permit this page's inline scripts.

## Verification

Run the dependency-free catalog/model regression checks:

```sh
node tests/catalog-model.test.js
```

Run the Edge Function authentication checks:

```sh
node tests/basic-auth.test.mjs
```

They exercise the default catalog, an added high-clip row, a wide one-clip-per-title catalog, and a deep multi-clip catalog through both workers. The checks verify output lengths and bounds, confirm that `distinct titles + within-session repeats = session size`, and prove that adding a row changes both algorithm result sets.

Before publishing a change, also perform this browser smoke test:

1. Load the page and confirm the default Shorts simulation completes.
2. Confirm both Shorts histograms, both cumulative threshold charts, and all four summary values are populated; each cumulative chart must end at 100% of simulated sessions.
3. Open **Parent Title Repetition** and confirm its first run completes.
4. Confirm all six parent-title histograms and their summary values are populated.
5. Add, edit, and remove catalog rows; confirm row and grand totals update correctly.
6. Change at least one session input in each tab and rerun it.
7. Check the browser console for errors and inspect both desktop and narrow layouts.

For changes to the simulation itself, also compare deterministic outputs before and after the change and document any intentional model change in `docs/MODEL.md`.
