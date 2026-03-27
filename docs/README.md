# GitHub Pages Version

This `docs/` directory is a standalone static recreation of the `3029` Shiny app for GitHub Pages.

## What It Uses

- `index.html`, `styles.css`, and `app.js` provide the full client-side app.
- `data/` contains copied CSV outputs from `shiny_app/source_files_for_shiny_app/`.
- No Shiny server is required. All filters, tables, charts, and threshold calculations run in the browser.

## Local Preview

Open it through a local web server, not `file://`, because the browser needs to fetch the CSV files.

Example:

```bash
cd /Users/shallaj/Library/CloudStorage/OneDrive-UniversityofCalifornia,SanDiegoHealth/Statistics/HGC_SH/projects/3029_Ruben_CDC_Topcon_3_27_2026/docs
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## GitHub Pages Deployment

For a project repository:

1. Commit the `docs/` directory.
2. Push to GitHub.
3. In GitHub repository settings, open `Pages`.
4. Set the source to `Deploy from a branch`.
5. Choose your main branch and the `/docs` folder.

The site will publish from this directory directly.

## Updating the Data

If the analysis outputs change, copy refreshed CSV files from:

```text
shiny_app/source_files_for_shiny_app/
```

into:

```text
docs/data/
```

The static site will use the new bundle without any other code changes unless file names or schemas change.
