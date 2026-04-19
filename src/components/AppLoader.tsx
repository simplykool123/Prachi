export default function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight text-neutral-800">Prachi Fulagar</p>
          <p className="text-xs text-neutral-400">Loading workspace...</p>
        </div>
        <div className="relative h-1 w-48 overflow-hidden rounded-full bg-neutral-200">
          <div className="absolute inset-y-0 w-1/2 rounded-full bg-primary-600/80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
