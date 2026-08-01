import UIKit
import Capacitor
import FirebaseAuth
import WebKit

private final class NativeHeaderActionView: UIVisualEffectView {
    let button = UIButton(type: .system)
    var actionID = ""

    override init(effect: UIVisualEffect?) {
        super.init(effect: effect)
        clipsToBounds = true
        layer.borderWidth = 1
        button.translatesAutoresizingMaskIntoConstraints = false
        button.accessibilityIdentifier = "maratonou.native.header.action"
        contentView.addSubview(button)
        NSLayoutConstraint.activate([
            button.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            button.topAnchor.constraint(equalTo: contentView.topAnchor),
            button.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

@objc(MaratonouBridgeViewController)
public class MaratonouBridgeViewController: CAPBridgeViewController, UITabBarDelegate, WKScriptMessageHandler {
    private let nativeChromeHandlerName = "maratonouNativeChrome"
    private var nativeTabBar: UITabBar?
    private var nativeTabBarHeightConstraint: NSLayoutConstraint?
    private var wantsNativeTabBar = false
    private var keyboardIsVisible = false
    private var nativeChromeConfigured = false
    private var nativeChromeIsDark = true
    private var nativeModalIsVisible = false
    private var nativeHeaderActions: [String: NativeHeaderActionView] = [:]
    private var pendingHeaderActionIDs = Set<String>()
    private var nativeHeaderActionRemovalWorkItems: [String: DispatchWorkItem] = [:]
    private var nativeHeaderRoute = ""

    public override func capacitorDidLoad() {
        configureNativeChromeIfNeeded()
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        nativeTabBarHeightConstraint?.constant = 49 + view.safeAreaInsets.bottom
    }

    deinit {
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: nativeChromeHandlerName)
        NotificationCenter.default.removeObserver(self)
    }

    private func configureNativeChromeIfNeeded() {
        guard !nativeChromeConfigured, let webView = bridge?.webView else { return }
        nativeChromeConfigured = true

        let contentController = webView.configuration.userContentController
        contentController.add(self, name: nativeChromeHandlerName)
        contentController.addUserScript(WKUserScript(
            source: Self.nativeChromeBootstrapScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        webView.evaluateJavaScript(Self.nativeChromeBootstrapScript)

        let tabBar = UITabBar(frame: .zero)
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.delegate = self
        tabBar.items = makeTabItems()
        tabBar.selectedItem = tabBar.items?.first
        tabBar.isHidden = true
        tabBar.alpha = 0
        tabBar.accessibilityIdentifier = "maratonou.native.tabbar"
        configureTabBarAppearance(tabBar)

        view.addSubview(tabBar)
        view.bringSubviewToFront(tabBar)
        let height = tabBar.heightAnchor.constraint(equalToConstant: 49 + view.safeAreaInsets.bottom)
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            height,
        ])
        nativeTabBar = tabBar
        nativeTabBarHeightConstraint = height
        applyNativeChromeTheme(isDark: nativeChromeIsDark)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(accessibilityDisplayOptionsDidChange),
            name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
            object: nil
        )
    }

    private func makeTabItems() -> [UITabBarItem] {
        let language = Locale.preferredLanguages.first?.lowercased() ?? "en"
        let labels: [String]
        if language.hasPrefix("pt") {
            labels = ["Início", "Séries", "Buscar", "Filmes", "Atividade", "Perfil"]
        } else if language.hasPrefix("es") {
            labels = ["Inicio", "Series", "Buscar", "Películas", "Actividad", "Perfil"]
        } else {
            labels = ["Home", "Series", "Search", "Movies", "Activity", "Profile"]
        }

        // These template images are generated from the same SVG sprite used by
        // React. UIKit owns the tab behavior, but the Maratonou icon language
        // remains identical on iOS, Android and the web.
        let imageNames = [
            "NativeTabHome",
            "NativeTabSeries",
            "NativeTabSearch",
            "NativeTabMovies",
            "NativeTabActivity",
            "NativeTabProfile",
        ]

        return zip(labels, imageNames).enumerated().map { index, value in
            let (label, imageName) = value
            let image = UIImage(named: imageName)?.withRenderingMode(.alwaysTemplate)
            let item = UITabBarItem(
                title: label,
                image: image,
                selectedImage: image
            )
            item.tag = index
            item.accessibilityLabel = label
            item.accessibilityHint = language.hasPrefix("pt")
                ? "Abre a seção \(label)"
                : "Opens the \(label) section"
            return item
        }
    }

    /// UIKit owns the material. iOS 26 supplies Liquid Glass automatically;
    /// older systems use the system material and respect accessibility flags.
    private func configureTabBarAppearance(_ tabBar: UITabBar) {
        let selectedColor: UIColor = nativeChromeIsDark ? .white : .black
        let normalColor: UIColor = nativeChromeIsDark
            ? UIColor.white.withAlphaComponent(0.56)
            : UIColor.black.withAlphaComponent(0.48)
        tabBar.tintColor = selectedColor
        tabBar.unselectedItemTintColor = normalColor

        guard #unavailable(iOS 26.0) else {
            // Deliberately leave the iOS 26 appearance untouched so the system
            // can render and animate the current Liquid Glass implementation.
            // tintColor still owns the selected icon color, preventing the
            // platform's default blue accent from leaking into the app theme.
            return
        }

        let appearance = UITabBarAppearance()
        if UIAccessibility.isReduceTransparencyEnabled {
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = .systemBackground
        } else {
            appearance.configureWithTransparentBackground()
            appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
            appearance.backgroundColor = .clear
        }
        let layouts = [
            appearance.stackedLayoutAppearance,
            appearance.inlineLayoutAppearance,
            appearance.compactInlineLayoutAppearance,
        ]
        layouts.forEach { itemAppearance in
            itemAppearance.normal.iconColor = normalColor
            itemAppearance.normal.titleTextAttributes = [.foregroundColor: normalColor]
            itemAppearance.selected.iconColor = selectedColor
            itemAppearance.selected.titleTextAttributes = [.foregroundColor: selectedColor]
        }
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
    }

    private func applyNativeChromeTheme(isDark: Bool) {
        nativeChromeIsDark = isDark
        let interfaceStyle: UIUserInterfaceStyle = isDark ? .dark : .light
        nativeTabBar?.overrideUserInterfaceStyle = interfaceStyle
        if let tabBar = nativeTabBar {
            configureTabBarAppearance(tabBar)
        }
        nativeHeaderActions.values.forEach { styleNativeHeaderAction($0) }
    }

    @objc private func accessibilityDisplayOptionsDidChange() {
        guard let tabBar = nativeTabBar else { return }
        configureTabBarAppearance(tabBar)
        nativeHeaderActions.values.forEach { styleNativeHeaderAction($0) }
    }

    @objc private func keyboardWillShow() {
        keyboardIsVisible = true
        updateNativeTabBarVisibility(animated: true)
    }

    @objc private func keyboardWillHide() {
        keyboardIsVisible = false
        updateNativeTabBarVisibility(animated: true)
    }

    private func updateNativeTabBarVisibility(animated: Bool) {
        guard let tabBar = nativeTabBar else { return }
        let shouldShow = wantsNativeTabBar && !keyboardIsVisible && !nativeModalIsVisible
        let changes = {
            tabBar.alpha = shouldShow ? 1 : 0
            tabBar.transform = shouldShow ? .identity : CGAffineTransform(translationX: 0, y: 12)
        }
        let completion: (Bool) -> Void = { _ in tabBar.isHidden = !shouldShow }

        if shouldShow { tabBar.isHidden = false }
        if animated && !UIAccessibility.isReduceMotionEnabled {
            UIView.animate(
                withDuration: 0.28,
                delay: 0,
                usingSpringWithDamping: 0.86,
                initialSpringVelocity: 0.2,
                options: [.beginFromCurrentState, .allowUserInteraction],
                animations: changes,
                completion: completion
            )
        } else {
            changes()
            completion(true)
        }
    }

    private func updateNativeModalVisibility(_ visible: Bool) {
        nativeModalIsVisible = visible
        nativeHeaderActions.values.forEach { $0.isHidden = visible }
        updateNativeTabBarVisibility(animated: true)
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let routes = ["/home", "/series", "/search", "/movies", "/feed", "/profile"]
        guard routes.indices.contains(item.tag) else { return }
        let route = routes[item.tag]
        let script = "window.dispatchEvent(new CustomEvent('maratonou:native-tab-select',{detail:{href:'\(route)'}}));"
        bridge?.webView?.evaluateJavaScript(script)
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == nativeChromeHandlerName,
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            switch type {
            case "visibility":
                self.wantsNativeTabBar = body["visible"] as? Bool ?? false
                self.updateNativeTabBarVisibility(animated: true)
            case "route":
                if let path = body["path"] as? String {
                    self.selectNativeTab(for: path)
                }
            case "theme":
                if let value = body["value"] as? String {
                    self.applyNativeChromeTheme(isDark: value == "dark")
                }
            case "modal":
                self.updateNativeModalVisibility(body["visible"] as? Bool ?? false)
            case "controls":
                self.updateNativeHeaderActions(
                    body["controls"] as? [[String: Any]] ?? [],
                    route: body["route"] as? String ?? ""
                )
            case "controlsCommitted":
                let ids = body["ids"] as? [String] ?? []
                self.revealNativeHeaderActions(ids: ids)
            case "actionSheet":
                self.presentNativeActionSheet(body)
            default:
                break
            }
        }
    }

    private func updateNativeHeaderActions(_ controls: [[String: Any]], route: String) {
        guard let webView = bridge?.webView else { return }
        let incomingIDs = Set(controls.compactMap { $0["id"] as? String })
        let routeChanged = !nativeHeaderRoute.isEmpty && nativeHeaderRoute != route
        nativeHeaderRoute = route
        pendingHeaderActionIDs = incomingIDs

        incomingIDs.forEach { id in
            nativeHeaderActionRemovalWorkItems[id]?.cancel()
            nativeHeaderActionRemovalWorkItems.removeValue(forKey: id)
        }

        let staleIDs = nativeHeaderActions.keys.filter { !incomingIDs.contains($0) }
        for id in staleIDs {
            if routeChanged {
                removeNativeHeaderAction(id: id)
            } else {
                scheduleNativeHeaderActionRemoval(id: id)
            }
        }

        for control in controls {
            guard let id = control["id"] as? String,
                  let x = (control["x"] as? NSNumber)?.doubleValue,
                  let y = (control["y"] as? NSNumber)?.doubleValue,
                  let width = (control["width"] as? NSNumber)?.doubleValue,
                  let height = (control["height"] as? NSNumber)?.doubleValue else { continue }

            let actionView: NativeHeaderActionView
            if let current = nativeHeaderActions[id] {
                actionView = current
            } else {
                actionView = NativeHeaderActionView(effect: nil)
                actionView.actionID = id
                // Keep the native replacement transparent until JavaScript has
                // hidden the matching web control. This prevents both layers
                // from being visible during the readiness handshake.
                actionView.alpha = 0
                actionView.button.accessibilityValue = id
                actionView.button.addTarget(self, action: #selector(nativeHeaderActionTapped(_:)), for: .touchUpInside)
                styleNativeHeaderAction(actionView)
                view.addSubview(actionView)
                nativeHeaderActions[id] = actionView
            }

            let nextFrame = CGRect(
                x: webView.frame.minX + CGFloat(x),
                y: webView.frame.minY + CGFloat(y),
                width: CGFloat(width),
                height: CGFloat(height)
            )
            actionView.layer.removeAllAnimations()
            UIView.performWithoutAnimation {
                actionView.frame = nextFrame
                actionView.layoutIfNeeded()
            }
            actionView.layer.cornerRadius = min(actionView.bounds.width, actionView.bounds.height) / 2
            actionView.button.accessibilityLabel = control["label"] as? String
            actionView.button.accessibilityTraits = (control["active"] as? Bool ?? false)
                ? [.button, .selected]
                : [.button]
            if let dataURL = control["iconDataUrl"] as? String,
               let image = imageFromDataURL(dataURL, pointSize: 19) {
                actionView.button.setImage(image.withRenderingMode(.alwaysTemplate), for: .normal)
            }
            actionView.isHidden = nativeModalIsVisible
            view.bringSubviewToFront(actionView)
        }

        if let tabBar = nativeTabBar {
            view.bringSubviewToFront(tabBar)
        }

        let idsJSON = jsonString(Array(incomingIDs)) ?? "[]"
        bridge?.webView?.evaluateJavaScript(
            "window.__MARATONOU_NATIVE_UI__?.setReady(\(idsJSON));"
        )
    }

    private func scheduleNativeHeaderActionRemoval(id: String) {
        guard nativeHeaderActionRemovalWorkItems[id] == nil else { return }
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, !self.pendingHeaderActionIDs.contains(id) else { return }
            self.removeNativeHeaderAction(id: id)
        }
        nativeHeaderActionRemovalWorkItems[id] = workItem
        // A short grace period absorbs transient DOM measurements during a
        // React render without leaving stale controls behind on navigation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: workItem)
    }

    private func removeNativeHeaderAction(id: String) {
        nativeHeaderActionRemovalWorkItems[id]?.cancel()
        nativeHeaderActionRemovalWorkItems.removeValue(forKey: id)
        nativeHeaderActions[id]?.removeFromSuperview()
        nativeHeaderActions.removeValue(forKey: id)
        let idsJSON = jsonString([id]) ?? "[]"
        bridge?.webView?.evaluateJavaScript(
            "window.__MARATONOU_NATIVE_UI__?.clearReady(\(idsJSON));"
        )
    }

    private func revealNativeHeaderActions(ids: [String]) {
        let committed = Set(ids).intersection(pendingHeaderActionIDs)
        committed.forEach { id in
            guard let actionView = nativeHeaderActions[id] else { return }
            actionView.isHidden = nativeModalIsVisible
            actionView.layer.removeAllAnimations()
            actionView.alpha = 1
        }
    }

    private func styleNativeHeaderAction(_ actionView: NativeHeaderActionView) {
        actionView.overrideUserInterfaceStyle = nativeChromeIsDark ? .dark : .light
        if UIAccessibility.isReduceTransparencyEnabled {
            actionView.effect = nil
            actionView.backgroundColor = nativeChromeIsDark
                ? UIColor(white: 0.14, alpha: 1)
                : UIColor(white: 0.96, alpha: 1)
            actionView.layer.borderWidth = 1
            actionView.layer.borderColor = (
                nativeChromeIsDark
                    ? UIColor.white.withAlphaComponent(0.24)
                    : UIColor.black.withAlphaComponent(0.10)
            ).cgColor
        } else if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .regular)
            glass.isInteractive = true
            actionView.effect = glass
            actionView.backgroundColor = .clear
            actionView.layer.borderWidth = 0
            actionView.layer.borderColor = UIColor.clear.cgColor
        } else {
            actionView.effect = UIBlurEffect(style: .systemUltraThinMaterial)
            actionView.backgroundColor = .clear
            actionView.layer.borderWidth = 1
            actionView.layer.borderColor = (
                nativeChromeIsDark
                    ? UIColor.white.withAlphaComponent(0.24)
                    : UIColor.white.withAlphaComponent(0.82)
            ).cgColor
        }
        actionView.button.tintColor = nativeChromeIsDark ? .white : .black
    }

    @objc private func nativeHeaderActionTapped(_ sender: UIButton) {
        guard let id = sender.accessibilityValue else { return }
        let encodedID = jsonString(id) ?? "\"\""
        bridge?.webView?.evaluateJavaScript(
            "window.__MARATONOU_NATIVE_UI__?.activate(\(encodedID));"
        )
    }

    private func imageFromDataURL(_ dataURL: String, pointSize: CGFloat) -> UIImage? {
        guard let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
              let source = UIImage(data: data) else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = UIScreen.main.scale
        return UIGraphicsImageRenderer(
            size: CGSize(width: pointSize, height: pointSize),
            format: format
        ).image { _ in
            source.draw(in: CGRect(x: 0, y: 0, width: pointSize, height: pointSize))
        }
    }

    private func presentNativeActionSheet(_ body: [String: Any]) {
        guard let requestID = body["requestId"] as? String else { return }
        let controller = UIAlertController(
            title: body["title"] as? String,
            message: body["message"] as? String,
            preferredStyle: .actionSheet
        )
        let actions = body["actions"] as? [[String: Any]] ?? []
        for item in actions {
            guard let id = item["id"] as? String,
                  let title = item["title"] as? String else { continue }
            let role = item["role"] as? String
            let style: UIAlertAction.Style = role == "destructive"
                ? .destructive
                : (role == "cancel" ? .cancel : .default)
            let action = UIAlertAction(title: title, style: style) { [weak self] _ in
                self?.updateNativeModalVisibility(false)
                self?.postWebEvent(
                    name: "maratonou:native-action-sheet-result",
                    detail: ["requestId": requestID, "actionId": id]
                )
            }
            action.isEnabled = item["disabled"] as? Bool != true
            controller.addAction(action)
        }
        if !actions.contains(where: { ($0["role"] as? String) == "cancel" }) {
            controller.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { [weak self] _ in
                self?.updateNativeModalVisibility(false)
                self?.postWebEvent(
                    name: "maratonou:native-action-sheet-result",
                    detail: ["requestId": requestID, "actionId": NSNull()]
                )
            })
        }
        if let popover = controller.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 1, width: 1, height: 1)
        }
        updateNativeModalVisibility(true)
        topPresentedViewController().present(controller, animated: true)
    }

    private func topPresentedViewController() -> UIViewController {
        var current: UIViewController = self
        while let presented = current.presentedViewController {
            current = presented
        }
        return current
    }

    private func postWebEvent(name: String, detail: [String: Any]) {
        guard let detailJSON = jsonString(detail) else { return }
        bridge?.webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('\(name)',{detail:\(detailJSON)}));"
        )
    }

    private func jsonString(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let string = String(data: data, encoding: .utf8) else {
            if let string = value as? String,
               let data = try? JSONSerialization.data(withJSONObject: [string]),
               let array = String(data: data, encoding: .utf8) {
                return String(array.dropFirst().dropLast())
            }
            return nil
        }
        return string
    }

    private func selectNativeTab(for path: String) {
        let index: Int
        if path.hasPrefix("/title/tv") || path.hasPrefix("/episode") || path.hasPrefix("/series") {
            index = 1
        } else if path.hasPrefix("/search") {
            index = 2
        } else if path.hasPrefix("/title/movie") || path.hasPrefix("/movies") {
            index = 3
        } else if path.hasPrefix("/feed") {
            index = 4
        } else if path.hasPrefix("/profile") || path.hasPrefix("/user") || path.hasPrefix("/settings") {
            index = 5
        } else {
            index = 0
        }
        nativeTabBar?.selectedItem = nativeTabBar?.items?.first(where: { $0.tag == index })
    }

    private static let nativeChromeBootstrapScript = """
    (() => {
      if (window.__MARATONOU_NATIVE_CHROME_BOOTSTRAPPED__) return;
      window.__MARATONOU_NATIVE_CHROME_BOOTSTRAPPED__ = true;

      const handler = () => window.webkit?.messageHandlers?.maratonouNativeChrome;
      const selector = [
        '.ios-top-action',
        '.glass-header-action-slot > button',
        '.app-bar-action-slot > button',
        '.landing-page-header > button'
      ].join(',');
      let sequence = 0;
      let scheduled = false;
      let syncInFlight = false;
      let syncRequested = false;
      let lastDigest = '';
      let lastModal = false;
      let spritePromise = null;
      const iconCache = new Map();

      const spriteDocument = async () => {
        if (!spritePromise) {
          spritePromise = fetch('/icons/streamline-flex-solid.svg')
            .then(response => response.text())
            .then(text => new DOMParser().parseFromString(text, 'image/svg+xml'))
            .catch(() => null);
        }
        return spritePromise;
      };

      const originalIconPNG = async (button) => {
        const holder = button.querySelector('[data-maratonou-icon-id]');
        const iconID = holder?.dataset?.maratonouIconId;
        if (!iconID) return null;
        if (iconCache.has(iconID)) return iconCache.get(iconID);

        const pending = (async () => {
          const source = await spriteDocument();
          const symbol = source?.getElementById(iconID);
          if (!symbol) return null;
          const viewBox = symbol.getAttribute('viewBox') || '0 0 14 14';
          const body = symbol.innerHTML.replaceAll('currentColor', '#000000');
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="#000000" color="#000000">${body}</svg>`;
          return await new Promise(resolve => {
            const image = new Image();
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            image.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = 48;
              canvas.height = 48;
              const context = canvas.getContext('2d');
              context?.drawImage(image, 4, 4, 40, 40);
              URL.revokeObjectURL(url);
              resolve(canvas.toDataURL('image/png'));
            };
            image.onerror = () => {
              URL.revokeObjectURL(url);
              resolve(null);
            };
            image.src = url;
          });
        })();
        iconCache.set(iconID, pending);
        return pending;
      };

      const visibleControls = async () => {
        if (document.documentElement?.dataset?.modalOpen === 'true') return null;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const elements = Array.from(document.querySelectorAll(selector));
        const controls = [];
        for (const element of elements) {
          if (!element.dataset.nativeActionId) {
            element.dataset.nativeActionId = `native-action-${++sequence}`;
          }
          const iconDataUrl = await originalIconPNG(element);
          // An async icon decode can outlive the DOM node that requested it.
          // Measure only after it resolves so stale geometry is never posted.
          if (!iconDataUrl || !element.isConnected) continue;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const nativeReady = element.dataset.nativeControlReady === 'true';
          if (
            style.display === 'none' ||
            (style.visibility === 'hidden' && !nativeReady) ||
            Number(style.opacity) === 0 ||
            rect.width < 24 ||
            rect.height < 24 ||
            rect.right <= 0 ||
            rect.bottom <= 0 ||
            rect.left >= viewportWidth ||
            rect.top >= viewportHeight
          ) continue;
          // Controls without a Maratonou icon remain web-owned. This prevents
          // UIKit from silently replacing branded artwork with system glyphs.
          const pixelRatio = window.devicePixelRatio || 1;
          const quantize = value => Math.round(value * pixelRatio) / pixelRatio;
          controls.push({
            id: element.dataset.nativeActionId,
            x: quantize(rect.x),
            y: quantize(rect.y),
            width: quantize(rect.width),
            height: quantize(rect.height),
            label: element.getAttribute('aria-label') || element.getAttribute('title') || '',
            active: element.getAttribute('aria-pressed') === 'true' || element.dataset.active === 'true',
            iconDataUrl
          });
        }
        return controls;
      };

      const syncModal = () => {
        const visible = document.documentElement?.dataset?.modalOpen === 'true';
        if (visible === lastModal) return;
        lastModal = visible;
        handler()?.postMessage({ type: 'modal', visible });
      };

      const syncControls = async () => {
        scheduled = false;
        if (syncInFlight) {
          syncRequested = true;
          return;
        }

        syncInFlight = true;
        try {
          // Serialize measurements and discard a scan if the DOM changed while
          // an icon was decoding. Only the newest complete scan reaches UIKit.
          do {
            syncRequested = false;
            syncModal();
            const controls = await visibleControls();
            if (syncRequested || controls === null) continue;
            const route = `${location.pathname}${location.search}`;
            const digest = JSON.stringify([route, controls.map(({ id, x, y, width, height, active }) => [
              id,
              x,
              y,
              width,
              height,
              active
            ])]);
            if (digest !== lastDigest) {
              lastDigest = digest;
              handler()?.postMessage({ type: 'controls', route, controls });
            }
          } while (syncRequested);
        } finally {
          syncInFlight = false;
          if (syncRequested) scheduleSync();
        }
      };

      const scheduleSync = () => {
        syncRequested = true;
        if (scheduled || syncInFlight) return;
        scheduled = true;
        requestAnimationFrame(syncControls);
      };

      const markNativeChrome = () => {
        if (!document.documentElement) return;
        document.documentElement.dataset.nativeChrome = 'true';
        document.documentElement.dataset.nativeControls = 'true';
        document.documentElement.style.setProperty('--native-tabbar-base-height', '49px');
        window.__MARATONOU_NATIVE_CHROME__ = true;
        window.dispatchEvent(new CustomEvent('maratonou:native-chrome-ready'));
        scheduleSync();
      };

      window.__MARATONOU_NATIVE_UI__ = {
        activate(id) {
          document.querySelector(`[data-native-action-id="${CSS.escape(id)}"]`)?.click();
        },
        setReady(ids) {
          const ready = new Set(ids);
          document.querySelectorAll(selector).forEach(element => {
            if (ready.has(element.dataset.nativeActionId)) {
              element.dataset.nativeControlReady = 'true';
            }
          });
          handler()?.postMessage({ type: 'controlsCommitted', ids });
        },
        clearReady(ids) {
          const stale = new Set(ids);
          document.querySelectorAll(selector).forEach(element => {
            if (stale.has(element.dataset.nativeActionId)) {
              delete element.dataset.nativeControlReady;
            }
          });
        },
        scheduleSync
      };

      markNativeChrome();
      document.addEventListener('DOMContentLoaded', () => {
        markNativeChrome();
        new MutationObserver(scheduleSync).observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'aria-pressed', 'data-modal-open']
        });
      }, { once: true });
      // Scroll events from the app's internal page containers do not bubble.
      // Capture them at window level so UIKit always follows the web control.
      window.addEventListener('scroll', scheduleSync, { passive: true, capture: true });
      window.addEventListener('resize', scheduleSync, { passive: true });
      window.visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
      window.addEventListener('popstate', scheduleSync);
      window.addEventListener('maratonou:native-chrome-sync', scheduleSync);
    })();
    """
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if Auth.auth().canHandle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        NotificationCenter.default.post(
            name: Notification.Name("didReceiveRemoteNotification"),
            object: completionHandler,
            userInfo: userInfo
        )
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
