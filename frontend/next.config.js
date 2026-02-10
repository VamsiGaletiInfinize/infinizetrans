/** @type {import('next').NextConfig} */
const nextConfig = {
  // Chime SDK references some globals that break double-render in strict mode
  reactStrictMode: false,
  webpack: (config) => {
    // Some Chime SDK transitive deps reference node built-ins
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;
