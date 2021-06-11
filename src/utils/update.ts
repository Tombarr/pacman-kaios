/* global MozActivity, WebActivity */

const CHECK_FOR_UPDATES = Boolean(
    typeof window === 'object' &&
    window.navigator &&
    typeof window.navigator['mozApps'] === 'function'
);

// KaiOS 2.5
export const hasMozActivity = Boolean(
    typeof window === 'object' &&
    'MozActivity' in window
);

// KaiOS 3.0
export const hasWebActivity = Boolean(
    typeof window === 'object' &&
    'WebActivity' in window
);
  
// Checks if an update is available
export function isUpdateAvailable(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (!CHECK_FOR_UPDATES) {
            return resolve(false);
        }

        const request: DOMRequest = window.navigator['mozApps'].getSelf();
        request.onsuccess = () => {
            const app: App = request.result;
            const updateRequest = app.checkForUpdate();
            updateRequest.onsuccess = () => resolve(app.downloadAvailable);
            updateRequest.onerror = () => {
                // Side-loaded or installed outside of KaiStore/ JioStore
                if (updateRequest.error && updateRequest.error.name === 'NOT_UPDATABLE') {
                    return resolve(false);
                }

                reject(updateRequest.error);
            };
        };
        request.onerror = () => reject(request.error);
    });
}

export function openAppPromise(url): Promise<any> {
    if (url === null || url === undefined || url.length === 0) {
        return Promise.resolve(false);
    }

    if (hasMozActivity) {
        // KaiOS 2.5
        return new Promise((resolve, reject) => {
            const request: DOMRequest = new MozActivity({
                name: 'open-page',
                data: {
                    type: 'url',
                    url,
                },
            });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } else if (hasWebActivity) {
        // KaiOS 3.0
        const activity = new WebActivity('open-page', {
            type: 'url',
            url,
        });
        return activity.start();
    };

    return Promise.resolve(false);
}
  
// Launches the app details page on KaiStore or JioStore
export function goToStore(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (!CHECK_FOR_UPDATES) {
            return resolve(false);
        }

        const request: DOMRequest = window.navigator['mozApps'].getSelf();
        request.onsuccess = () => {
            const app: App = request.result;
            openAppPromise(app.manifestURL)
                .then(resolve)
                .catch(reject);
        };
        request.onerror = () => reject(request.error);
    });
}