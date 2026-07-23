import UIKit
import Capacitor
import FirebaseAuth

@objc(SFSymbolsPlugin)
public class SFSymbolsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SFSymbolsPlugin"
    public let jsName = "SFSymbols"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "render", returnType: CAPPluginReturnPromise)
    ]

    private let cache = NSCache<NSString, NSString>()

    @objc func render(_ call: CAPPluginCall) {
        guard let symbolName = call.getString("name"), !symbolName.isEmpty else {
            call.reject("A symbol name is required")
            return
        }

        let requestedSize = call.getDouble("size") ?? 22
        let pointSize = CGFloat(min(max(requestedSize, 8), 128))
        let weightName = call.getString("weight") ?? "regular"
        let cacheKey = "\(symbolName):\(pointSize):\(weightName)" as NSString

        if let cached = cache.object(forKey: cacheKey) {
            call.resolve(["dataUrl": cached as String])
            return
        }

        DispatchQueue.main.async { [weak self] in
            let configuration = UIImage.SymbolConfiguration(
                pointSize: pointSize,
                weight: self?.symbolWeight(named: weightName) ?? .regular,
                scale: .medium
            )
            guard let source = UIImage(systemName: symbolName, withConfiguration: configuration) else {
                call.reject("SF Symbol is unavailable: \(symbolName)")
                return
            }

            let symbol = source.withTintColor(.white, renderingMode: .alwaysOriginal)
            let canvas = CGSize(width: pointSize, height: pointSize)
            let format = UIGraphicsImageRendererFormat()
            format.opaque = false
            format.scale = min(UIScreen.main.scale, 3)

            let data = UIGraphicsImageRenderer(size: canvas, format: format).pngData { _ in
                let sourceSize = symbol.size
                let ratio = min(canvas.width / sourceSize.width, canvas.height / sourceSize.height)
                let drawSize = CGSize(width: sourceSize.width * ratio, height: sourceSize.height * ratio)
                let drawOrigin = CGPoint(
                    x: (canvas.width - drawSize.width) / 2,
                    y: (canvas.height - drawSize.height) / 2
                )
                symbol.draw(in: CGRect(origin: drawOrigin, size: drawSize))
            }

            let dataUrl = "data:image/png;base64,\(data.base64EncodedString())"
            self?.cache.setObject(dataUrl as NSString, forKey: cacheKey)
            call.resolve(["dataUrl": dataUrl])
        }
    }

    private func symbolWeight(named value: String) -> UIImage.SymbolWeight {
        switch value.lowercased() {
        case "bold": return .bold
        default: return .semibold
        }
    }
}

@objc(MaratonouBridgeViewController)
public class MaratonouBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SFSymbolsPlugin())
    }
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
