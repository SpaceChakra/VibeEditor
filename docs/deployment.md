# Deployment

VibeEditor is connected to Vercel as `randroid88s-projects/vibeeditor`.

Vercel Git integration owns deployment:

- Pull requests build and deploy to the Vercel `preview` target.
- The Vercel `qa` custom environment is configured to branch-track `main`.
- `qa` is a Vercel pre-production environment, not a Git branch.
- Production traffic promotion is intentionally not automatic.

`main` automatic Git deployments are disabled in `vercel.json` until the Vercel
Production environment's branch tracking is moved off `main` in the dashboard.
After that dashboard setting is changed, remove the `main: false` rule from
`git.deploymentEnabled` so pushes to `main` ship to `qa`.

GitHub Actions provides the required repository CI check by running `npm ci` and
`npm run build` for pull requests and pushes to `main`.
