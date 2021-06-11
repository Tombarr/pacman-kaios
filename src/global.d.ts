declare enum DOMRequestReadyState { "pending", "done" }

declare interface DOMRequest {
    onsuccess: Function;
    onerror: Function;
    error?: DOMError;
    readyState: DOMRequestReadyState;
    result: any;
}

declare class WebActivity {
    constructor(name: string, data?: object);  
    start(): Promise<any>;
    cancel(): void;
}

declare interface MozActivityOptions {
    name: string;
    data?: Object;
}

declare class MozActivity implements DOMRequest {
    constructor(data: MozActivityOptions);
    onsuccess: Function;
    onerror: Function;
    error?: DOMError;
    readyState: DOMRequestReadyState;
    result: MozActivity;
    cancel: () => void;
}

declare interface DOMApplicationsRegistry {
    getSelf: () => DOMRequest;
    checkInstalled: () => DOMRequest;
    getInstalled: () => DOMRequest;
    installPackage: () => DOMRequest;
}

declare interface App {
    manifest: Object;
    manifestURL: string;
    origin: string;
    installOrigin: string;
    installTime: number;
    state: string;
    launch: Function;
    downloadAvailable: boolean;
    checkForUpdate: () => DOMRequest;
}
