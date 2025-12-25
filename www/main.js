class Data {
    rawData = new Int16Array(300);
    writeIndex = 0;

    write(chunk) {
        if (chunk.length > this.rawData.length) {
            chunk = chunk.subarray(chunk.length-this.rawData.length);
        }
        if (chunk.length < this.rawData.length-this.writeIndex) {
            this.rawData.subarray(this.writeIndex).set(chunk);
        } else {
            this.rawData.subarray(this.writeIndex).set(chunk.subarray(0, this.rawData.length-this.writeIndex));
            this.rawData.set(chunk.subarray(this.rawData.length-this.writeIndex));
        }
        this.writeIndex = (this.writeIndex + chunk.length)%this.rawData.length;
    }

    last() {
        return this.rawData[(this.writeIndex + this.rawData.length - 1)%this.rawData.length];
    }

    *[Symbol.iterator]() {
        for (let i=this.writeIndex; i<this.rawData.length; ++i) {
            yield this.rawData[i];
        }
        for (let i=0; i<this.writeIndex; ++i) {
            yield this.rawData[i];
        }
    }
}

/** @type {HTMLFormElement} */ const settingsForm = document.getElementById("settings");
/** @type {HTMLInputElement} */ const calibrationOffsetInput = document.getElementById("calibration-offset");
/** @type {HTMLInputElement} */ const calibrationScaleInput = document.getElementById("calibration-scale");
/** @type {SVGLineElement} */ const dataGraphLine = document.getElementById("data-graph-trace");
/** @type {HTMLElement} */ const dataCurrentText = document.getElementById("data-current");
/** @type {HTMLElement} */ const dataMaxText = document.getElementById("data-max");

async function fetchData(uri, handler) {
    let response = await fetch(uri);
    let reader = response.body.getReader();

    while (true) {
        let { done, value } = await reader.read();
        if (done) {
            break;
        }
        let chunk = new Int16Array(value.buffer, 0, value.length/2);
        handler(chunk);
    }
}

async function fetchSettings(uri) {
    let response = await fetch(uri);
    if (!response.ok) {
        throw new Error("failed to get " + uri);
    }
    return response.text().then(text => new URLSearchParams(text))
}

async function refreshSettings() {
    const data = await fetchSettings("/settings");
    for(const [key, val] of data.entries()) {
        const input = settingsForm.elements[key];
        input.value = val;
    }
}

const data = new Data();
let offset = 0.0;
let scale = 1.0;
let maxValue = 0.0;
let updatePending = false;

function applyCalibration() {
    offset = calibrationOffsetInput.valueAsNumber;
    scale = calibrationScaleInput.valueAsNumber;
    updateLiveGraph();
    localStorage.setItem("calibration-offset", offset);
    localStorage.setItem("calibration-scale", scale);
}

function resetCalibration() {
    calibrationOffsetInput.value = offset
    calibrationScaleInput.value = scale
}

function updateLiveGraph() {
    let idx = 0;
    let dataPointsStr = "";
    for (const v of data) {
        dataPointsStr += (idx++)+","+((v-offset)/scale).toFixed(2)+" ";
    }
    dataGraphLine.setAttribute("points",  dataPointsStr);
    dataCurrentText.innerHTML = ((data.last()-offset)/scale).toFixed(2);
    dataMaxText.innerHTML = ((maxValue-offset)/scale).toFixed(2);
    updatePending = false;
}

function initNavigation() {
    const showTab = (id) => {
        for(const tab_id of ["data-tab", "calibration-tab", "settings-tab"]) {
            document.getElementById(tab_id).style.display = (id == tab_id ? 'block' : 'none');
        }
    }
    document.getElementById("nav-data-tab-show").onclick = () => { showTab("data-tab"); }
    document.getElementById("nav-calibration-tab-show").onclick = () => { showTab("calibration-tab"); }
    document.getElementById("nav-settings-tab-show").onclick = () => { showTab("settings-tab"); }
}

function initSettingsView() {
    document.getElementById("settings-reset").onclick = refreshSettings;
    settingsForm.onsubmit = (event) => {
        event.preventDefault();
        fetch("/settings", { method: "POST", body: new URLSearchParams(new FormData(settingsForm)) });
    };

    /** @type {HTMLInputElement} */ const firmwareUpdateFile = document.getElementById("firmware-update-file");
    document.getElementById("firmware-update").onclick = (event) => firmwareUpdateFile.click();
    firmwareUpdateFile.onchange = () => {
        if (firmwareUpdateFile.files.length == 0) {
            return;
        }
        document.getElementById("firmware-update-status").textContent = "Uploading...";
        fetch("/system/firmware", { method: "POST", body: firmwareUpdateFile.files[0]})
            .then(() => {
                firmwareUpdateFile.value = null;
                document.getElementById("firmware-update-status").textContent = "Rebooting...";
                window.setTimeout(() => window.location.reload(), 5)
            }, () => {
                firmwareUpdateFile.value = null;
                document.getElementById("firmware-update-status").textContent = "Failed...";
            });
    }

    refreshSettings();

    fetchSettings("/system").then((data) => {
        document.getElementById("firware-version").innerText = data.get("fw_version");
        document.getElementById("chip-vcc").innerText = (parseInt(data.get("chip_vcc"))/100).toFixed(2)+"v";
    });
}

function initDataView() {
    document.getElementById("data-max-reset").onclick = () => { maxValue = offset; };

    offset = localStorage.getItem("calibration-offset") || offset;
    scale = localStorage.getItem("calibration-scale", ) || scale;

    fetchData("/load.bin", (chunk) => {
        data.write(chunk);
        for (let value of chunk) {
            if (value > maxValue) {
                maxValue = value;
            }
        }
        if (!updatePending) {
            updatePending = true;
            window.requestAnimationFrame(updateLiveGraph);
        }
    });
}

function initCalibrationView() {
    document.getElementById("calibration-apply").onclick = applyCalibration;
    document.getElementById("calibration-reset").onclick = resetCalibration;
    resetCalibration();
}

initNavigation();
initSettingsView();
initDataView();
initCalibrationView();
