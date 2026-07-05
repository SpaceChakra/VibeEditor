# Deployment

VibeEditor is connected to Vercel as `randroid88s-projects/vibeeditor`.

Vercel Git integration owns deployment:

- Pull requests build and deploy to the Vercel `preview` target.
- Pushes to `main` build and deploy to the Vercel `qa` custom environment through branch tracking.
- `qa` is a Vercel pre-production environment, not a Git branch.
- Production traffic promotion is intentionally not automatic.

GitHub Actions provides the required repository CI check by running `npm ci` and
`npm run build` for pull requests and pushes to `main`.
