## What & why

Briefly describe the change and the motivation.

## How tested

- [ ] `cd web && npx tsc --noEmit` passes
- [ ] `cd web && npm run build` passes
- [ ] Tested against a real Times Gate _(or: no hardware — describe how you verified)_
- Steps / screenshots:

## Checklist

- [ ] `CHANGELOG.md` updated with an entry for this change
- [ ] Version bumped (semver) and sources agree (`web/src/App.tsx` `APP_VERSION`,
      `bridge/app.py` `VERSION`, `README.md`)
- [ ] No secrets committed (API keys, tokens, device LocalToken)
- [ ] Matches existing code style
