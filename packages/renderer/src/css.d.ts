// CSS side-effect imports (React Flow's stylesheet and our own) carry no type
// declarations; this ambient module lets tsc resolve them. The bundler handles
// the actual CSS at build time.
declare module '*.css';
