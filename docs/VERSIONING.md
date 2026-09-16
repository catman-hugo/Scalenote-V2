# Versioning Scheme

ScaleNote follows a **semantic‑style versioning** that is tied directly to the project milestones.

## Scheme

```
MAJOR.MINOR.PATCH
```

* **MAJOR** – becomes `1` only when *all* core milestones (including optional ones such as the 3DS client) are complete.  This signals that the product is feature‑complete and ready for a stable release.
* **MINOR** – reflects the *milestone number* that is currently finished.  After Milestone 1 the version is `0.1.x`, after Milestone 2 it is `0.2.x`, etc.  When Milestone 3 is complete the version will be `0.3.0`.
* **PATCH** – is used for interim progress **within a milestone**.  If a milestone is only partially done, we use a half‑step to indicate being roughly halfway.  For example, halfway through Milestone 3 the version would be `0.2.5` (the `5` denotes “mid‑milestone”).  The patch portion can be any integer that makes sense for smaller increments (e.g. `0.2.1`, `0.2.2`, …) but the convention is:
    * `0.x.0` – milestone `x` fully completed.
    * `0.x.5` – roughly half of milestone `x` completed.
    * other numbers – smaller incremental changes.

## Example Progression

| Milestone | Version after completion | Mid‑milestone (≈50 % done) |
|-----------|--------------------------|---------------------------|
| 1 | `0.1.0` | `0.0.5` (optional early work) |
| 2 | `0.2.0` | `0.1.5` |
| 3 | `0.3.0` | `0.2.5` |
| 7 | `0.7.0` | `0.6.5` |
| Final (all optional milestones) | `1.0.0` | — |

The version is updated **as soon as a milestone is officially marked finished** in `PROGRESS.md`.  Minor or patch bumps are also recorded in `DECISIONS.md` to keep a clear history of why a particular increment was chosen.

## How to Apply

1. When a milestone is completed, update the three version locations:
   * `Cargo.toml` (workspace) – `version = "0.<milestone>.0"`
   * `src-tauri/Cargo.toml` – same value
   * `src-tauri/tauri.conf.json` – same value
2. For half‑milestone progress, bump the **patch** to `5` (e.g., `0.2.5`).
3. When all core and optional milestones are done, bump to `1.0.0`.

This file should be consulted by any future automation or agents to understand the versioning logic.
