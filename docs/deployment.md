# Deployment

VibeEditor is connected to Vercel as `randroid88s-projects/vibeeditor`.

Vercel Git integration owns deployment:

- Pull requests build and deploy to the Vercel `preview` target.
- Pushes to `main` build and deploy to the Vercel `qa` custom environment.
- `qa` is a Vercel pre-production environment, not a Git branch.
- Production deployments are tracked from the `production` Git branch.

GitHub Actions provides the required repository CI check by running `npm ci` and
`npm run build` for pull requests and pushes to `main`.
