export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">CodeB v3.5 Project</h1>
        <p className="text-xl mb-4">Welcome to your new Next.js project!</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded">
            <h2 className="text-xl font-bold mb-2">🚀 Getting Started</h2>
            <p>Edit src/app/page.tsx to get started</p>
          </div>
          <div className="p-4 border rounded">
            <h2 className="text-xl font-bold mb-2">📚 Documentation</h2>
            <p>Check out the Next.js documentation</p>
          </div>
        </div>
      </div>
    </main>
  )
}
