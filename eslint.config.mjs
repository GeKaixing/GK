import nextVitalsConfig from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitalsConfig,
  {
    ignores: ["generated/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // react-hooks v6 rules newly enabled by eslint-config-next 16.
      // These flag established patterns (setState-in-effect, ref access,
      // manual memoization) across the codebase; kept as warnings to be
      // addressed incrementally rather than breaking the build.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    }
  }
];

export default eslintConfig;
