import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public class FolderPickerModule: Module {
  private var pickerDelegate: FolderPickerDelegate?
  private var activeURLs: [String: URL] = [:]

  public func definition() -> ModuleDefinition {
    Name("FolderPicker")

    // Present the iOS folder picker. Returns { uri, bookmark } or null if cancelled.
    AsyncFunction("pickFolder") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let topVC = Self.topViewController() else {
          promise.reject("E_NO_VIEW_CONTROLLER", "No root view controller found")
          return
        }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        picker.allowsMultipleSelection = false
        let delegate = FolderPickerDelegate { [weak self] result in
          guard let self = self else { promise.resolve(nil); return }
          if let result = result {
            // Keep security scope active for subsequent file reads
            self.activeURLs[result.uri] = result.url
            promise.resolve(["uri": result.uri, "bookmark": result.bookmark])
          } else {
            promise.resolve(nil)
          }
        }
        self.pickerDelegate = delegate
        picker.delegate = delegate
        topVC.present(picker, animated: true)
      }
    }

    // Resolve a saved bookmark back to a URI, re-establishing access after app restart.
    AsyncFunction("resolveBookmark") { (bookmarkString: String, promise: Promise) in
      guard !bookmarkString.isEmpty,
            let bookmarkData = Data(base64Encoded: bookmarkString) else {
        promise.reject("E_INVALID_BOOKMARK", "Invalid bookmark data")
        return
      }
      do {
        var isStale = false
        let url = try URL(
          resolvingBookmarkData: bookmarkData,
          options: [],
          relativeTo: nil,
          bookmarkDataIsStale: &isStale
        )
        url.startAccessingSecurityScopedResource()
        self.activeURLs[url.absoluteString] = url

        var freshBookmark = bookmarkString
        if isStale {
          if let newData = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            freshBookmark = newData.base64EncodedString()
          }
        }
        promise.resolve(["uri": url.absoluteString, "bookmark": freshBookmark, "stale": isStale])
      } catch {
        promise.reject("E_BOOKMARK_RESOLVE", error.localizedDescription)
      }
    }

    AsyncFunction("releaseBookmark") { (uri: String, promise: Promise) in
      if let url = self.activeURLs[uri] {
        url.stopAccessingSecurityScopedResource()
        self.activeURLs.removeValue(forKey: uri)
      }
      promise.resolve(nil)
    }

    // Read a file, returning its string content or null if it doesn't exist.
    // Works for any path including iCloud Drive.
    AsyncFunction("readFile") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri) else { promise.resolve(nil); return }
      let fm = FileManager.default
      guard fm.fileExists(atPath: url.path) else { promise.resolve(nil); return }
      // Trigger iCloud download if needed (blocks until ready or fails)
      try? fm.startDownloadingUbiquitousItem(at: url)
      do {
        let content = try String(contentsOf: url, encoding: .utf8)
        promise.resolve(content)
      } catch {
        promise.resolve(nil)
      }
    }

    // Write string content to a file, creating parent directories as needed.
    AsyncFunction("writeFile") { (uri: String, content: String, promise: Promise) in
      guard let url = URL(string: uri) else {
        promise.reject("E_INVALID_URI", "Invalid URI: \(uri)")
        return
      }
      do {
        let parent = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true, attributes: nil)
        try content.write(to: url, atomically: true, encoding: .utf8)
        promise.resolve(nil)
      } catch {
        promise.reject("E_WRITE", error.localizedDescription)
      }
    }

    // Create a directory (and any missing parents). Safe to call if it already exists.
    AsyncFunction("createDirectory") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri) else { promise.resolve(nil); return }
      try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
      promise.resolve(nil)
    }

    // Delete a file if it exists.
    AsyncFunction("deleteFile") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri) else { promise.resolve(nil); return }
      try? FileManager.default.removeItem(at: url)
      promise.resolve(nil)
    }

    // List .json files in a directory. Returns array of absolute URI strings.
    AsyncFunction("listJsonFiles") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri) else { promise.resolve([]); return }
      do {
        let contents = try FileManager.default.contentsOfDirectory(
          at: url,
          includingPropertiesForKeys: nil,
          options: [.skipsHiddenFiles]
        )
        let jsonFiles = contents
          .filter { $0.pathExtension == "json" }
          .map { $0.absoluteString }
        promise.resolve(jsonFiles)
      } catch {
        promise.resolve([])
      }
    }
  }

  private static func topViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes
      .filter({ $0.activationState == .foregroundActive })
      .compactMap({ $0 as? UIWindowScene })
      .first,
      let window = scene.windows.first(where: { $0.isKeyWindow }),
      let rootVC = window.rootViewController
    else { return nil }
    var top = rootVC
    while let presented = top.presentedViewController { top = presented }
    return top
  }
}

private class FolderPickerDelegate: NSObject, UIDocumentPickerDelegate {
  struct PickResult {
    let url: URL
    let uri: String
    let bookmark: String
  }

  private let completion: (PickResult?) -> Void

  init(completion: @escaping (PickResult?) -> Void) {
    self.completion = completion
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else { completion(nil); return }

    // Start security scope and keep it active — the module will store the URL
    // in activeURLs to maintain access for subsequent file reads.
    _ = url.startAccessingSecurityScopedResource()
    var bookmarkString = ""
    if let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
      bookmarkString = data.base64EncodedString()
    }
    // Note: do NOT call stopAccessingSecurityScopedResource here.
    // The module keeps the scope alive via activeURLs.
    completion(PickResult(url: url, uri: url.absoluteString, bookmark: bookmarkString))
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    completion(nil)
  }
}
