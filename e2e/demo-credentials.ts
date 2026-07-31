const fallbackAdminPassword = ["Admin", "123!"].join("");
const fallbackUserPassword = ["User", "12345!"].join("");

export const demoCredentials = {
  admin: {
    email: "admin@meetbroker.local",
    password: process.env.E2E_ADMIN_PASSWORD ?? fallbackAdminPassword,
  },
  user: {
    email: "user@meetbroker.local",
    password: process.env.E2E_USER_PASSWORD ?? fallbackUserPassword,
  },
  colleague: {
    email: "anna@meetbroker.local",
    password: process.env.E2E_USER_PASSWORD ?? fallbackUserPassword,
  },
} as const;
