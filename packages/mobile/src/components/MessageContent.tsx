import React from 'react'
import { Text, View, StyleSheet, ScrollView } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

interface Props {
  text: string
}

interface Token {
  type: 'heading' | 'code_block' | 'paragraph' | 'blockquote' | 'table'
  level?: number
  lang?: string
  content: string
  rows?: string[][]
  headerRow?: string[]
}

/** Tokenize markdown into blocks */
function tokenize(md: string): Token[] {
  const tokens: Token[] = []
  const lines = md.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      tokens.push({ type: 'code_block', lang, content: codeLines.join('\n') })
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      tokens.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] })
      i++
      continue
    }

    // Blockquote: consecutive lines starting with >
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      tokens.push({ type: 'blockquote', content: quoteLines.join('\n') })
      continue
    }

    // Table: line with |, followed by separator line (|---|), followed by data rows
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|\s:]*$/.test(lines[i + 1])) {
      const headerRow = line.split('|').map(c => c.trim()).filter(c => c !== '')
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|')) {
        const row = lines[i].split('|').map(c => c.trim()).filter(c => c !== '')
        if (row.length > 0) rows.push(row)
        i++
      }
      tokens.push({ type: 'table', content: '', headerRow, rows })
      continue
    }

    // Paragraph: collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^#{1,4}\s/) &&
      !lines[i].startsWith('>') &&
      !(lines[i].includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-|\s:]*$/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i])
      i++
    }
    const content = paraLines.join('\n').trim()
    if (content) {
      tokens.push({ type: 'paragraph', content })
    }
  }

  return tokens
}

/** Render inline markdown (bold, italic, inline code, links) to Text nodes */
function renderInline(text: string, colors: Record<string, string>): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Pattern matches: **bold**, *italic*, `code`, [text](url)
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      nodes.push(<Text key={key++} style={{ fontWeight: '700', fontStyle: 'italic' }}>{match[2]}</Text>)
    } else if (match[3]) {
      nodes.push(<Text key={key++} style={{ fontWeight: '700' }}>{match[3]}</Text>)
    } else if (match[4]) {
      nodes.push(<Text key={key++} style={{ fontStyle: 'italic' }}>{match[4]}</Text>)
    } else if (match[5]) {
      nodes.push(
        <Text key={key++} style={{
          fontFamily: 'Menlo',
          fontSize: 13,
          color: '#e879f9',
          backgroundColor: colors.surface
        }}>
          {' '}{match[5]}{' '}
        </Text>
      )
    } else if (match[6] && match[7]) {
      nodes.push(<Text key={key++} style={{ color: colors.accent }}>{match[6]}</Text>)
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

export function MessageContent({ text }: Props): JSX.Element {
  const colors = useTheme()
  const tokens = tokenize(text)

  return (
    <View style={{ flexShrink: 1, minWidth: 0 }}>
      {tokens.map((token, i) => {
        if (token.type === 'heading') {
          const fontSize = token.level === 1 ? 20 : token.level === 2 ? 18 : token.level === 3 ? 16 : 15
          return (
            <Text key={i} style={[styles.heading, { fontSize, color: colors.text }]}>
              {renderInline(token.content, colors)}
            </Text>
          )
        }

        if (token.type === 'code_block') {
          return (
            <View key={i} style={[styles.codeBlock, { backgroundColor: colors.surface }]}>
              {token.lang ? (
                <Text style={[styles.codeLang, { color: colors.muted }]}>{token.lang}</Text>
              ) : null}
              <Text style={[styles.codeText, { color: colors.text }]} selectable>
                {token.content}
              </Text>
            </View>
          )
        }

        if (token.type === 'blockquote') {
          return (
            <View key={i} style={[styles.blockquote, { borderLeftColor: colors.accent, backgroundColor: `${colors.surface}80` }]}>
              <Text style={[styles.paragraph, { color: colors.text, marginBottom: 0 }]}>
                {renderInline(token.content, colors)}
              </Text>
            </View>
          )
        }

        if (token.type === 'table' && token.headerRow && token.rows) {
          const colCount = token.headerRow.length
          return (
            <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={[styles.table, { borderColor: colors.border }]}>
                {/* Header */}
                <View style={[styles.tableRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                  {token.headerRow.map((cell, ci) => (
                    <View key={ci} style={[styles.tableCell, ci < colCount - 1 && { borderRightColor: colors.border, borderRightWidth: 1 }]}>
                      <Text style={[styles.tableCellText, { color: colors.text, fontWeight: '600' }]}>
                        {renderInline(cell, colors)}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* Data rows */}
                {token.rows.map((row, ri) => (
                  <View key={ri} style={[styles.tableRow, ri < token.rows!.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                    {row.map((cell, ci) => (
                      <View key={ci} style={[styles.tableCell, ci < colCount - 1 && { borderRightColor: colors.border, borderRightWidth: 1 }]}>
                        <Text style={[styles.tableCellText, { color: colors.text }]}>
                          {renderInline(cell, colors)}
                        </Text>
                      </View>
                    ))}
                    {/* Pad missing cells */}
                    {row.length < colCount && Array.from({ length: colCount - row.length }).map((_, ci) => (
                      <View key={`pad-${ci}`} style={[styles.tableCell, (row.length + ci) < colCount - 1 && { borderRightColor: colors.border, borderRightWidth: 1 }]} />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          )
        }

        // Paragraph — handle bullet lists within
        const lines = token.content.split('\n')
        return (
          <Text key={i} style={[styles.paragraph, { color: colors.text }]}>
            {lines.map((line, j) => {
              const bulletMatch = line.match(/^[-*]\s+(.+)$/)
              const orderedMatch = line.match(/^\d+\.\s+(.+)$/)
              const prefix = bulletMatch ? '  \u2022 ' : orderedMatch ? `  ${line.match(/^\d+/)![0]}. ` : ''
              const content = bulletMatch ? bulletMatch[1] : orderedMatch ? orderedMatch[1] : line

              return (
                <Text key={j}>
                  {j > 0 ? '\n' : ''}
                  {prefix ? <Text>{prefix}</Text> : null}
                  {renderInline(content, colors)}
                </Text>
              )
            })}
          </Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  heading: {
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8
  },
  codeBlock: {
    borderRadius: 8,
    padding: 12,
    marginVertical: 6
  },
  codeLang: {
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 18
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 6,
    borderRadius: 4
  },
  tableScroll: {
    marginVertical: 6
  },
  table: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1
  },
  tableCell: {
    minWidth: 80,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  tableCellText: {
    fontSize: 13,
    lineHeight: 18
  }
})
