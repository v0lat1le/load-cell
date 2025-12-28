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
    /** @type {HTMLButtonElement} */ const settingsToggle = document.getElementById("settings-view-toggle");
    /** @type {HTMLDivElement} */ const dataView = document.getElementById("data-view");
    /** @type {HTMLDivElement} */ const settingsView = document.getElementById("settings-view");

    var settingsOn = false;
    settingsToggle.onclick = () => {
        settingsOn = !settingsOn;
        dataView.style.display = settingsOn ? 'none' : 'block';
        settingsView.style.display = settingsOn ? 'block' : 'none';
        settingsToggle.innerText = settingsOn ? "G" : "O";
    };
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

    refreshSettings();

    /** @type {HTMLInputElement} */ const firmwareUpdateFile = document.getElementById("firmware-update-file");
    /** @type {HTMLSpanElement} */ const firmwareUpdateStatus = document.getElementById("firmware-update-status");

    document.getElementById("firmware-update").onclick = (event) => firmwareUpdateFile.click();
    firmwareUpdateFile.onchange = () => {
        if (firmwareUpdateFile.files.length == 0) {
            return;
        }
        firmwareUpdateStatus.textContent = "Uploading...";
        fetch("/system/firmware", { method: "POST", body: firmwareUpdateFile.files[0]})
            .then(() => {
                firmwareUpdateFile.value = null;
                firmwareUpdateStatus.textContent = "Rebooting...";
                window.setTimeout(() => window.location.reload(), 5)
            }, () => {
                firmwareUpdateFile.value = null;
                firmwareUpdateStatus.textContent = "Failed...";
            });
    }

    /** @type {HTMLElement} */ const firmwareVersion = document.getElementById("firmware-version");
    /** @type {HTMLElement} */ const chipVcc = document.getElementById("chip-vcc");
    fetchParams("/system").then((data) => {
        firmwareVersion.innerText = data.get("fw_version");
        chipVcc.innerText = (parseInt(data.get("chip_vcc"))/100).toFixed(2)+"v";
    });
}

var offset = 0.0;
var scale = 1.0;

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

    offset = parseFloat(localStorage.getItem("calibration-offset")) || 0.0;
    scale = parseFloat(localStorage.getItem("calibration-scale")) || 1.0;
    
    resetCalibration();
}

function initDataView() {
    /** @type {SVGSVGElement} */ const dataGraph = document.getElementById("data-graph");
    /** @type {SVGPolylineElement} */ const dataGraphLine = document.getElementById("data-graph-trace");

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
        graphLineMatrix.d = 1.0/scale;
        graphLineMatrix.f = -offset*graphLineMatrix.d;
        graphLineMatrix.e = viewBox.x+viewBox.width-x;
        dataGraphLine.transform.baseVal.initialize(dataGraph.createSVGTransformFromMatrix(graphLineMatrix));
    }

    /** @type {SVGLineElement} */ const dataGraphMaxLine = document.getElementById("data-graph-max-line");
    /** @type {SVGTextElement} */ const dataGraphMaxText = document.getElementById("data-graph-max");
    /** @type {HTMLElement} */ const dataMaxText = document.getElementById("data-max");
    /** @type {SVGLineElement} */ const dataGraphCurrentLine = document.getElementById("data-graph-current-line");
    /** @type {SVGTextElement} */ const dataGraphCurrentText = document.getElementById("data-graph-current");
    /** @type {HTMLElement} */ const dataCurrentText = document.getElementById("data-current");

    function updateLiveView(chunk) {
        updateLiveGraph(chunk);

        for (let value of chunk) {
            if (value > maxValue) {
                maxValue = value;
            }
        }
        const calibratedCurrent = ((chunk[chunk.length-1]-offset)/scale);
        dataCurrentText.textContent = calibratedCurrent.toFixed(1).padStart(4);
        dataGraphCurrentLine.y1.baseVal.value = dataGraphCurrentLine.y2.baseVal.value = calibratedCurrent;
        dataGraphCurrentText.y.baseVal.getItem(0).value = -calibratedCurrent-1;
        dataGraphCurrentText.textContent = calibratedCurrent.toFixed(2);

        const calibratedMax = ((maxValue-offset)/scale);
        dataMaxText.textContent = calibratedMax.toFixed(1).padStart(4);
        dataGraphMaxLine.y1.baseVal.value = dataGraphMaxLine.y2.baseVal.value = calibratedMax;
        dataGraphMaxText.y.baseVal.getItem(0).value = -calibratedMax-1;
        dataGraphMaxText.textContent = calibratedMax.toFixed(2);
    }

    let maxValue = offset;
    document.getElementById("data-max-reset").onclick = () => {
        maxValue = offset; 
        dataMaxText.textContent = "0.00";
    };

    fetchData("/load.bin", updateLiveView);
    //window.setInterval(() => updateLiveView([Math.random()*5000-50]), 100);
}

initNavigation();
initSettingsView();
initDataView();
initCalibrationView();
