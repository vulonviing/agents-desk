import Cocoa
import WebKit
import CoreGraphics

struct DisplayInfo: Codable {
    let id: UInt32
    let uuid: String
    let builtIn: Bool
    let mirrorOf: UInt32
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

func displays() -> [DisplayInfo] {
    var count: UInt32 = 0
    guard CGGetOnlineDisplayList(0, nil, &count) == .success, count > 0 else { return [] }
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetOnlineDisplayList(count, &ids, &count) == .success else { return [] }
    return ids.prefix(Int(count)).map { id in
        let bounds = CGDisplayBounds(id)
        let uuid = CGDisplayCreateUUIDFromDisplayID(id).map { CFUUIDCreateString(nil, $0.takeRetainedValue()) as String } ?? ""
        return DisplayInfo(id: id, uuid: uuid, builtIn: CGDisplayIsBuiltin(id) != 0, mirrorOf: CGDisplayMirrorsDisplay(id), x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height)
    }
}

// Never select a built-in display, even when macOS migrates a disconnected window there.
func monitorDecision(_ list: [DisplayInfo], target: String?, enabled: Bool, online: Bool) -> String {
    guard enabled, online, let target, let external = list.first(where: { !$0.builtIn && $0.uuid == target }) else { return "hidden" }
    if list.contains(where: { $0.id == external.id && $0.mirrorOf != 0 || $0.mirrorOf == external.id }) { return "extend" }
    return online ? "show" : "hidden"
}

final class MonitorWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class MonitorApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    let root: URL
    var settings: [String: Any] = [:]
    var window: MonitorWindow!
    var web: WKWebView!
    var timer: Timer?
    var statusItem: NSStatusItem!
    var online = false
    var checking = false
    var loading = false
    var loadedURL: URL?
    var target: String?
    var needsArrangement = false
    var configuring = false
    var lastSnapshot = ""
    var webReady = false
    var agents = 0
    var simTime = 0.0
    var lastError: String?
    var frameSignature = ""
    var locale = "tr"
    var captured = false
    lazy var strings: [String:[String:String]] = {
        guard let url = Bundle.main.url(forResource: "monitor-strings", withExtension: "json"), let bytes = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: bytes)) as? [String:[String:String]] ?? [:]
    }()
    func text(_ key: String) -> String { strings[locale]?[key] ?? strings["tr"]?[key] ?? key }
    func updateMenu() {
        let keys = ["show","reload",nil,"quit"] as [String?]
        for (index,key) in keys.enumerated() { if let key { statusItem.menu?.item(at: index)?.title = text(key) } }
        window.title = text("title")
    }
    var enabled: Bool { settings["enabled"] as? Bool ?? true }
    var port = 4317
    var baseURL: URL { URL(string: "http://127.0.0.1:\(port)/?display=external")! }
    init(root: URL) { self.root = root; super.init() }
    func file(_ name: String) -> URL { root.appendingPathComponent("data").appendingPathComponent(name) }
    func read(_ name: String) -> [String: Any] {
        guard let bytes = try? Data(contentsOf: file(name)), bytes.count < 2_000_000 else { return [:] }
        return (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] ?? [:]
    }
    func write(_ value: [String: Any], _ name: String) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
        try? bytes.write(to: file(name), options: .atomic)
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        try? FileManager.default.createDirectory(at: file("."), withIntermediateDirectories: true)
        settings = read("monitor-settings.json")
        if let index = CommandLine.arguments.firstIndex(of:"--port"), index+1<CommandLine.arguments.count, let value=Int(CommandLine.arguments[index+1]), (1024...65535).contains(value) { port=value }
        DistributedNotificationCenter.default().addObserver(self,selector:#selector(portChanged(_:)),name:NSNotification.Name("local.agents-desk.monitor.port"),object:nil)
        target = settings["displayUUID"] as? String
        locale = settings["locale"] as? String == "en" ? "en" : "tr"
        if enabled, target == nil, let external = displays().first(where: { !$0.builtIn && !$0.uuid.isEmpty }) {
            target = external.uuid
            settings["displayUUID"] = external.uuid
            settings["enabled"] = settings["enabled"] ?? true
            write(settings, "monitor-settings.json")
        }
        NSApp.setActivationPolicy(.accessory)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.addUserScript(WKUserScript(source: "try { if(!localStorage.getItem('desk-lang'))localStorage.setItem('desk-lang','\(locale)'); }catch(_){}", injectionTime:.atDocumentStart,forMainFrameOnly:true))
        if let bytes = try? Data(contentsOf: file("monitor-scene.json")), bytes.count < 2_000_000,
           let object = try? JSONSerialization.jsonObject(with: bytes),
           let encoded = try? JSONSerialization.data(withJSONObject: [object]),
           let json = String(data: encoded, encoding: .utf8) {
            let source = "try { if(!localStorage.getItem('desk-session-v2'))localStorage.setItem('desk-session-v2', JSON.stringify((\(json))[0])); } catch (_) {}"
            config.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        window = MonitorWindow(contentRect: .zero, styleMask: [.borderless], backing: .buffered, defer: false)
        window.title = text("title")
        window.backgroundColor = NSColor(red: 0.078, green: 0.082, blue: 0.122, alpha: 1)
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        window.contentView = web
        web.autoresizingMask = [.width, .height]
        setupMenu()
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(screensChanged), name: NSWorkspace.didWakeNotification, object: nil)
        CGDisplayRegisterReconfigurationCallback({ _, flags, pointer in
            guard let pointer else { return }
            let app = Unmanaged<MonitorApp>.fromOpaque(pointer).takeUnretainedValue()
            DispatchQueue.main.async {
                if flags.contains(.beginConfigurationFlag) { app.window.orderOut(nil); app.frameSignature = "" }
                app.screensChanged()
            }
        }, Unmanaged.passUnretained(self).toOpaque())
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.tick() }
        tick()
    }
    func setupMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "display.2", accessibilityDescription: text("title"))
        let menu = NSMenu()
        let toggle = NSMenuItem(title: text("show"), action: #selector(toggleEnabled), keyEquivalent: "")
        toggle.target = self; toggle.state = enabled ? .on : .off; menu.addItem(toggle)
        let reload = NSMenuItem(title: text("reload"), action: #selector(reloadOffice), keyEquivalent: "")
        reload.target = self; menu.addItem(reload)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: text("quit"), action: #selector(quit), keyEquivalent: "")
        quit.target = self; menu.addItem(quit)
        statusItem.menu = menu
    }
    @objc func toggleEnabled(_ item: NSMenuItem) {
        settings["enabled"] = !enabled; item.state = enabled ? .on : .off
        write(settings, "monitor-settings.json"); reconcile()
    }
    @objc func reloadOffice() { webReady = false; loading = true; web.reload(); tick() }
    @objc func quit() { saveScene(); window.orderOut(nil); NSApp.terminate(nil) }
    @objc func portChanged(_ note: Notification) {
        // Only the port the Desk server wrote to its own runtime file is trusted; the notification alone is not.
        guard let value=note.userInfo?["port"] as? Int, (1024...65535).contains(value), read("monitor-runtime.json")["port"] as? Int == value else { return }
        guard value != port else { reconcile(); return }
        port=value; online=false; window.orderOut(nil); frameSignature=""; tick()
    }
    @objc func screensChanged() {
        // Hide first, before AppKit can leave a migrated borderless window on the laptop.
        window.orderOut(nil); frameSignature = ""
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.reconcile() }
    }
    func extend(_ list: [DisplayInfo]) {
        guard !configuring, let target, let external = list.first(where: { !$0.builtIn && $0.uuid == target }) else { return }
        configuring = true
        var config: CGDisplayConfigRef?
        guard CGBeginDisplayConfiguration(&config) == .success else { configuring = false; lastError = "display-begin"; return }
        var success = true
        for display in list where display.mirrorOf != 0 && (display.id == external.id || display.mirrorOf == external.id) {
            if CGConfigureDisplayMirrorOfDisplay(config, display.id, kCGNullDirectDisplay) != .success { success = false }
        }
        if success {
            let result = CGCompleteDisplayConfiguration(config, .permanently)
            needsArrangement = result == .success
            if result != .success { lastError = "display-extend" }
        } else { CGCancelDisplayConfiguration(config); lastError = "display-mirror" }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.configuring = false; self?.reconcile() }
    }
    func arrange(_ list: [DisplayInfo]) {
        needsArrangement = false
        guard let target, let external = list.first(where: { !$0.builtIn && $0.uuid == target }), let internalDisplay = list.first(where: { $0.builtIn }) else { return }
        var config: CGDisplayConfigRef?
        guard CGBeginDisplayConfiguration(&config) == .success else { return }
        let a = CGConfigureDisplayOrigin(config, internalDisplay.id, 0, 0)
        let b = CGConfigureDisplayOrigin(config, external.id, Int32(internalDisplay.width), 0)
        if a == .success && b == .success { _ = CGCompleteDisplayConfiguration(config, .permanently) }
        else { CGCancelDisplayConfiguration(config) }
    }
    func reconcile() {
        let list = displays()
        if enabled, target == nil, let external = list.first(where: { !$0.builtIn && !$0.uuid.isEmpty }) {
            target = external.uuid; settings["displayUUID"] = external.uuid; settings["enabled"] = settings["enabled"] ?? true; write(settings, "monitor-settings.json")
        }
        let decision = monitorDecision(list, target: target, enabled: enabled, online: online)
        if decision == "extend" { window.orderOut(nil); extend(list); status(); return }
        if needsArrangement { arrange(list); return }
        guard decision == "show", let target, let screen = NSScreen.screens.first(where: { screen in
            guard let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value else { return false }
            return list.contains(where: { $0.id == id && !$0.builtIn && $0.uuid == target })
        }) else { window.orderOut(nil); frameSignature = ""; status(); return }
        let frame = screen.frame, signature = NSStringFromRect(frame)
        if signature != frameSignature || !window.isVisible {
            window.setFrame(frame, display: false); web.setFrameSize(frame.size)
            // No activate(), makeKey(), or full-screen Space switch: laptop focus stays untouched.
            window.orderFrontRegardless(); frameSignature = signature
        }
        status()
    }
    func tick() {
        reconcile(); saveScene()
        guard !checking else { return }
        checking = true
        let url = baseURL
        var request = URLRequest(url: url.appendingPathComponent("api/office")); request.url = URL(string: "/api/office", relativeTo: url)!.absoluteURL
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            let okay = (response as? HTTPURLResponse)?.statusCode == 200 && data.map { $0.count < 1_000_000 && ((try? JSONSerialization.jsonObject(with: $0)) as? [String: Any])?["agents"] != nil } == true
            DispatchQueue.main.async {
                guard let self else { return }; self.checking = false; guard self.baseURL == url else { return }; self.online = okay
                if okay && (self.loadedURL != url || (!self.loading && !self.webReady)) { self.load(url) }
                self.reconcile()
            }
        }.resume()
    }
    func load(_ url: URL) {
        loading = true; webReady = false; loadedURL = url; web.load(URLRequest(url: url))
    }
    func saveScene() {
        guard loadedURL != nil else { return }
        let script = "JSON.stringify({ready:!!window.OfficeDebug?.view?.agents?.length,agents:window.OfficeDebug?.view?.agents?.length||0,time:window.OfficeDebug?.view?.t||0,locale:window.OfficeI18n?.lang||'tr',scene:localStorage.getItem('desk-session-v2')})"
        web.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self, let string = result as? String, let bytes = string.data(using: .utf8), let state = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else { return }
            self.webReady = state["ready"] as? Bool ?? false; self.agents = state["agents"] as? Int ?? 0; self.simTime = state["time"] as? Double ?? 0
            if let scene = state["scene"] as? String, scene != self.lastSnapshot, let sceneBytes = scene.data(using: .utf8), sceneBytes.count < 2_000_000,
               let snapshot = (try? JSONSerialization.jsonObject(with: sceneBytes)) as? [String: Any], snapshot["view"] is [String: Any] {
                self.write(snapshot, "monitor-scene.json"); self.lastSnapshot = scene
            }
            if let locale = state["locale"] as? String, locale != self.locale { self.locale = locale; self.settings["locale"] = locale; self.write(self.settings,"monitor-settings.json"); self.updateMenu() }
            if self.webReady && !self.captured && CommandLine.arguments.contains("--capture") {
                self.captured = true
                DispatchQueue.main.asyncAfter(deadline: .now()+2) {
                    self.web.takeSnapshot(with: nil) { image, _ in
                        guard let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data:tiff), let png = bitmap.representation(using:.png,properties:[:]) else { return }
                        let folder = self.root.appendingPathComponent(".qa")
                        try? FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
                        try? png.write(to:folder.appendingPathComponent("monitor-native.png"),options:.atomic)
                    }
                }
            }
            self.status()
        }
    }
    func status() {
        let id = (window.screen?.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
        write(["enabled":enabled,"pid":ProcessInfo.processInfo.processIdentifier,"targetUUID":target ?? "","online":online,"visible":window.isVisible,"windowDisplay":id,"mainDisplay":CGMainDisplayID(),"ownsFocus":NSWorkspace.shared.frontmostApplication?.processIdentifier == ProcessInfo.processInfo.processIdentifier,"webReady":webReady,"agents":agents,"simTime":simTime,"error":lastError ?? "","displays":displays().map { ["id":$0.id,"builtIn":$0.builtIn,"mirrorOf":$0.mirrorOf] as [String:Any] }], "monitor-status.json")
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false; lastError = nil; saveScene() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loading = false; webReady = false; lastError = "page-load" }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loading = false; webReady = false }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == "127.0.0.1" && url.port == baseURL.port { decisionHandler(.allow) }
        else { if navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }; decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["https","http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; return nil
    }
}

let arguments = CommandLine.arguments
if let index = arguments.firstIndex(of:"--notify-port"), index+1<arguments.count, let port=Int(arguments[index+1]), (1024...65535).contains(port) {
    DistributedNotificationCenter.default().postNotificationName(NSNotification.Name("local.agents-desk.monitor.port"),object:nil,userInfo:["port":port],options:.deliverImmediately)
    RunLoop.current.run(until:Date().addingTimeInterval(0.1)); exit(0)
}
if arguments.contains("--diagnose") {
    let bytes = try JSONEncoder().encode(displays()); print(String(data: bytes, encoding: .utf8)!); exit(0)
}
if arguments.contains("--self-test") {
    let builtin = DisplayInfo(id: 1, uuid: "laptop", builtIn: true, mirrorOf: 0, x: 0, y: 0, width: 1470, height: 956)
    let external = DisplayInfo(id: 3, uuid: "samsung", builtIn: false, mirrorOf: 0, x: 1470, y: 0, width: 1920, height: 1080)
    let mirrored = DisplayInfo(id: 1, uuid: "laptop", builtIn: true, mirrorOf: 3, x: 0, y: 0, width: 1920, height: 1080)
    precondition(monitorDecision([builtin], target: "samsung", enabled: true, online: true) == "hidden")
    precondition(monitorDecision([builtin], target: "laptop", enabled: true, online: true) == "hidden")
    precondition(monitorDecision([builtin,external], target: "samsung", enabled: false, online: true) == "hidden")
    precondition(monitorDecision([builtin,external], target: "samsung", enabled: true, online: false) == "hidden")
    precondition(monitorDecision([builtin,external], target: "samsung", enabled: true, online: true) == "show")
    precondition(monitorDecision([mirrored,external], target: "samsung", enabled: true, online: true) == "extend")
    precondition(monitorDecision([builtin,external], target: "other", enabled: true, online: true) == "hidden")
    precondition(monitorDecision([mirrored,external], target: "samsung", enabled: true, online: false) == "hidden")
    print("8 monitor selection and hotplug safety checks passed"); exit(0)
}
let rootIndex = arguments.firstIndex(of: "--repo")
let rootPath = rootIndex.flatMap { $0+1 < arguments.count ? arguments[$0+1] : nil } ?? Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().path
let app = NSApplication.shared
let delegate = MonitorApp(root: URL(fileURLWithPath: rootPath))
app.delegate = delegate
app.run()
