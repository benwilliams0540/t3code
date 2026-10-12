# Threadspace development

Use Node as declared in `package.json`, pnpm and Vite+. Install dependencies from
this checkout with the existing lockfile:

```sh
vp install --frozen-lockfile
vp run dev
```

The development runner prints the actual ports and pairing URL. It keeps state
in the checkout's `.t3` directory. Use disposable state for an isolated test;
`~/.t3/userdata` is live user data.

For desktop development:

```sh
T3CODE_DESKTOP_BRAND=threadspace T3CODE_DEV_INSTANCE=feature-xyz vp run dev:desktop
```

This starts the T3 coding runtime and Threadspace client. Shared rooms also need
the compatible [Rooms backend](https://github.com/benwilliams0540/t3rooms) and, for
agent execution, its configured connector/runtime. See [using rooms](../user/rooms.md)
for source/server selection and authentication. Personal server credentials stay
scoped to that server's exact origin.

Use [local checks](../operations/ci.md) for the changed packages. For a packaged
desktop build, follow [Threadspace delivery](../operations/threadspace-delivery.md);
for native mobile, use that app's declared scripts and delivery configuration.
Source compilation does not establish installed-client or deployed-host behavior.

The upstream `npx t3` package and upstream desktop downloads run T3 Code. Use this
checkout and its own built artifacts to work on Threadspace.
