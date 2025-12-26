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

async function fetchParams(uri) {
    let response = await fetch(uri);
    if (!response.ok) {
        throw new Error("failed to get params from " + uri);
    }
    return response.text().then(text => new URLSearchParams(text))
}

function initNavigation() {
    const showTab = (id) => {
        for(const tabId of ["data-tab", "calibration-tab", "settings-tab"]) {
            document.getElementById(tabId).style.display = (id == tabId ? 'block' : 'none');
        }
    }
    document.getElementById("nav-data-tab-show").onclick = () => { showTab("data-tab"); }
    document.getElementById("nav-calibration-tab-show").onclick = () => { showTab("calibration-tab"); }
    document.getElementById("nav-settings-tab-show").onclick = () => { showTab("settings-tab"); }
}

function initSettingsView() {
    /** @type {HTMLFormElement} */ const settingsForm = document.getElementById("settings");

    async function refreshSettings() {
        const data = await fetchParams("/settings");
        for(const [key, val] of data.entries()) {
            const input = settingsForm.elements[key];
            input.value = val;
        }
    }

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

    fetchParams("/system").then((data) => {
        document.getElementById("firware-version").innerText = data.get("fw_version");
        document.getElementById("chip-vcc").innerText = (parseInt(data.get("chip_vcc"))/100).toFixed(2)+"v";
    });
}

var offset = 0.0;
var scale = 1.0;

function initDataView() {
    /** @type {SVGSVGElement} */ const dataGraph = document.getElementById("data-graph");
    /** @type {SVGPolylineElement} */ const dataGraphLine = document.getElementById("data-graph-trace");
    /** @type {HTMLElement} */ const dataCurrentText = document.getElementById("data-current");
    /** @type {HTMLElement} */ const dataMaxText = document.getElementById("data-max");

    var x = 0;
    function updateLiveGraph(chunk) {
        const viewBox = dataGraph.viewBox.baseVal;
        for (const v of chunk) {
            const point = dataGraph.createSVGPoint();
            point.x = ++x;
            point.y = v;
            dataGraphLine.points.appendItem(point);
            if (dataGraphLine.points.length > viewBox.width) {
                dataGraphLine.points.removeItem(0);
            }
        }
        const graphLineMatrix = dataGraph.createSVGMatrix();
        graphLineMatrix.d = -1;
        graphLineMatrix.e = viewBox.x+viewBox.width-x;
        graphLineMatrix.f = viewBox.y+viewBox.height;
        dataGraphLine.transform.baseVal.replaceItem(dataGraphLine.transform.baseVal.createSVGTransformFromMatrix(graphLineMatrix), 0);
    }

    function updateLiveView(chunk) {
        updateLiveGraph(chunk);
        for (let value of chunk) {
            if (value > maxValue) {
                maxValue = value;
            }
        }
        dataCurrentText.textContent = ((chunk[chunk.length-1]+offset)/scale).toFixed(2);
        dataMaxText.textContent = ((maxValue+offset)/scale).toFixed(2);
    }

    offset = parseFloat(localStorage.getItem("calibration-offset")) || 0.0;
    scale = parseFloat(localStorage.getItem("calibration-scale")) || 1.0;

    let maxValue = offset;
    document.getElementById("data-max-reset").onclick = () => {
        maxValue = offset; 
        dataMaxText.textContent = "0.00";
    };

    dataGraphLine.transform.baseVal.appendItem(dataGraph.createSVGTransformFromMatrix(dataGraph.createSVGMatrix()));
    const calibrationMatrix = dataGraph.createSVGMatrix();
    calibrationMatrix.d = 1.0/scale;
    calibrationMatrix.f = -offset*calibrationMatrix.d;
    dataGraphLine.transform.baseVal.appendItem(dataGraph.createSVGTransformFromMatrix(calibrationMatrix));

    fetchData("/load.bin", updateLiveView);
}

function initCalibrationView() {
    /** @type {HTMLInputElement} */ const calibrationOffsetInput = document.getElementById("calibration-offset");
    /** @type {HTMLInputElement} */ const calibrationScaleInput = document.getElementById("calibration-scale");

    function applyCalibration() {
        offset = calibrationOffsetInput.valueAsNumber;
        scale = calibrationScaleInput.valueAsNumber;
        localStorage.setItem("calibration-offset", offset);
        localStorage.setItem("calibration-scale", scale);
    }

    function resetCalibration() {
        calibrationOffsetInput.value = offset
        calibrationScaleInput.value = scale
    }

    document.getElementById("calibration-apply").onclick = applyCalibration;
    document.getElementById("calibration-reset").onclick = resetCalibration;
    
    resetCalibration();
}

initNavigation();
initSettingsView();
initDataView();
initCalibrationView();
