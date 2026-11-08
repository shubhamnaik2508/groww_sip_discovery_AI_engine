import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bundled research datasets (anonymised survey, public feedback, stored AI
  // outputs, validation reviews) are read at runtime, so ship them with every route.
  outputFileTracingIncludes: {
    "/*": ["./data/**/*"],
    "/**/*": ["./data/**/*"],
  },
};

export default nextConfig;
