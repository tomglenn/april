import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function SensitiveInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): JSX.Element {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md text-sm outline-none"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          paddingRight: '2.5rem'
        }}
      />
      <button
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--muted)' }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}
