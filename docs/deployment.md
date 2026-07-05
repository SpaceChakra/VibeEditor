# Deployment

VibeEditor is connected to Vercel as `randroid88s-projects/vibeeditor`.

Vercel Git integration owns deployment:

- Pull requests build and deploy to the Vercel `preview` target.
- The Vercel `qa` custom environment is configured to branch-track `main`.
- `qa` is a Vercel pre-production environment, not a Git branch.
- Production deployments are tracked from the `production` Git branch.

`main` automatic Vercel Git deployments are disabled in `vercel.json` because
Vercel still classified `main` Git and deploy-hook events as Production during
verification, even after the Production environment was moved to the
`production` branch. Leave the guard in place until `main` can be deployed
through a durable token-based CI job or Vercel respects the custom environment
routing for this project.

GitHub Actions provides the required repository CI check by running `npm ci` and
`npm run build` for pull requests and pushes to `main`.
