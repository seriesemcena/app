import UIKit
import Capacitor
import FirebaseAuth
import WebKit

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
            labels = ["Início", "Séries", "Buscar", "Filmes", "Feed", "Você"]
        } else if language.hasPrefix("es") {
            labels = ["Inicio", "Series", "Buscar", "Películas", "Feed", "Tú"]
        } else {
            labels = ["Home", "Series", "Search", "Movies", "Feed", "You"]
        }

        // Template images generated from the same SVG sprite used by React.
        // The toolbar remains native without changing Maratonou's icon set.
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
    }

    @objc private func accessibilityDisplayOptionsDidChange() {
        guard let tabBar = nativeTabBar else { return }
        configureTabBarAppearance(tabBar)
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
            default:
                break
            }
        }
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
      let lastModal = false;

      const syncModal = () => {
        const visible = document.documentElement?.dataset?.modalOpen === 'true';
        if (visible === lastModal) return;
        lastModal = visible;
        handler()?.postMessage({ type: 'modal', visible });
      };

      const markNativeChrome = () => {
        if (!document.documentElement) return;
        document.documentElement.dataset.nativeChrome = 'true';
        document.documentElement.style.setProperty('--native-tabbar-base-height', '49px');
        window.__MARATONOU_NATIVE_CHROME__ = true;
        window.dispatchEvent(new CustomEvent('maratonou:native-chrome-ready'));
        syncModal();
      };

      markNativeChrome();
      document.addEventListener('DOMContentLoaded', () => {
        markNativeChrome();
        new MutationObserver(syncModal).observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-modal-open']
        });
      }, { once: true });
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
