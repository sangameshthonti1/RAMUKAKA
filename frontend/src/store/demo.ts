export const DEMO_ROLES = ["household", "provider"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
let currentRole: DemoRole = "household";
export function getDemoRole() {
  return currentRole;
}
export function setDemoRole(role: DemoRole) {
  currentRole = role;
}
