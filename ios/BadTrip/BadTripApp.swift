import SwiftUI

// Step 1 of Route B: a real app that shows the tested web page full screen and adds what only an app can do.
@main
struct BadTripApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .background(Color(red: 21 / 255, green: 11 / 255, blue: 12 / 255))
        }
    }
}
