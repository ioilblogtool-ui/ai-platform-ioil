export const metadata = {
  title: 'AI Platform — Content Ops',
  description: 'AI-powered content operations dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
