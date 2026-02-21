export function FlowBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 opacity-90 dark:opacity-100"
      aria-hidden="true"
      style={{
        backgroundImage:
          "radial-gradient(circle at 16% 14%, rgba(56,189,248,0.08), transparent 38%), radial-gradient(circle at 86% 8%, rgba(99,102,241,0.1), transparent 34%)"
      }}
    />
  );
}
