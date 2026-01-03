import './globals.css'

export const metadata = {
  title: 'Inbox Cleaner',
  description: 'Privacy-first Gmail cleanup tool',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
