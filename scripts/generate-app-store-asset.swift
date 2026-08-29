import AppKit
import Foundation

guard CommandLine.arguments.count == 6,
      let width = Int(CommandLine.arguments[3]),
      let height = Int(CommandLine.arguments[4]),
      let source = NSImage(contentsOfFile: CommandLine.arguments[1]) else {
  fputs("Usage: generate-app-store-asset.swift <source> <output> <width> <height> <caption>\n", stderr)
  exit(1)
}

let output = CommandLine.arguments[2]
let caption = CommandLine.arguments[5]
guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: width,
  pixelsHigh: height,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: width * 4,
  bitsPerPixel: 32
), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { exit(1) }

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor(calibratedWhite: 0.02, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

let margin = CGFloat(width) * 0.105
let top = CGFloat(height) * 0.115
let bottom = CGFloat(height) * 0.055
let border = max(8, CGFloat(width) * 0.008)
let frame = NSRect(x: margin, y: bottom, width: CGFloat(width) - margin * 2, height: CGFloat(height) - top - bottom)
NSColor(calibratedRed: 217 / 255, green: 4 / 255, blue: 41 / 255, alpha: 1).setFill()
NSBezierPath(roundedRect: frame, xRadius: CGFloat(width) * 0.035, yRadius: CGFloat(width) * 0.035).fill()

let inner = frame.insetBy(dx: border, dy: border)
NSColor(calibratedRed: 23 / 255, green: 23 / 255, blue: 26 / 255, alpha: 1).setFill()
NSBezierPath(roundedRect: inner, xRadius: CGFloat(width) * 0.027, yRadius: CGFloat(width) * 0.027).fill()
let scale = min(inner.width / source.size.width, inner.height / source.size.height)
let imageRect = NSRect(x: inner.midX - source.size.width * scale / 2, y: inner.midY - source.size.height * scale / 2, width: source.size.width * scale, height: source.size.height * scale)
source.draw(in: imageRect, from: .zero, operation: .sourceOver, fraction: 1)

func drawCentered(_ text: String, y: CGFloat, size: CGFloat, color: NSColor, weight: NSFont.Weight) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: paragraph]
  text.draw(in: NSRect(x: 0, y: y, width: CGFloat(width), height: size * 1.35), withAttributes: attributes)
}

let captionSize = CGFloat(width) * (width < 1600 ? 0.057 : 0.038)
let brandSize = CGFloat(width) * (width < 1600 ? 0.026 : 0.018)
drawCentered(caption, y: CGFloat(height) - top * 0.72, size: captionSize, color: .white, weight: .heavy)
drawCentered("Switchify Remote", y: CGFloat(height) - top * 0.27, size: brandSize, color: NSColor(calibratedRed: 217 / 255, green: 4 / 255, blue: 41 / 255, alpha: 1), weight: .bold)

context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try data.write(to: URL(fileURLWithPath: output), options: .atomic)
