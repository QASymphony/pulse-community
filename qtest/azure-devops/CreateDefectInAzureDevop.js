const PulseSdk = require("@qasymphony/pulse-sdk");
const request = require("request");
const xml2js = require("xml2js");

// DO NOT EDIT exported "handler" function is the entrypoint
exports.handler = async function ({ event, constants, triggers }, context, callback) {
    const defectId = event.defect.id;
    console.log(`[Info] Create defect event received for '${defectId}'`);

    const defect = await getDefectById(event.defect.id);

    if (!defect) return;

    const name = getFieldValue(defect, "Summary");
    console.log(`[Info] Defect name: ${name}`);

    const description = getFieldValue(defect, "Description");
    console.log(`[Info] Defect description: ${description}`);

    const link = defect.web_url;
    console.log(`[Info] Defect link: ${link}`);

    const bug = await createAzDoBug(defectId, name, description, link);

    if (!bug) return;

    console.log(`[Info] Bug created in Azure DevOps:`);
    console.log(bug);

    function getNamePrefix(workItemId) {
        return `WI${workItemId}: `;
    }

    function getFieldValue(obj, fieldName) {
        if (!obj || !obj.properties) {
            console.log(`[Warn] Obj/properties not found.`);
            return;
        }
        const prop = obj.properties.find((p) => p.field_name === fieldName);
        if (!prop) {
            console.log(`[Warn] Property with field name '${fieldName}' not found.`);
            return;
        }

        return prop.field_value;
    }

    async function getDefectById(defectId) {
        const url = `https://${constants.ManagerURL}/api/v3/projects/${constants.ProjectID}/defects/${defectId}`;

        console.log(`[Info] Get defect details for '${defectId}'`);

        try {
            const response = await doqTestRequest(url, "GET", null);
            console.log(response);
            return response;
        } catch (error) {
            console.log("[Error] Failed to get defect by id.", error);
            failed = true;
        }

        return { failed: failed, requirement: requirement };
    }

    async function createAzDoBug(defectId, name, description, link) {
        console.log(`[Info] Creating bug in Azure DevOps '${defectId}'`);
        const url = encodeURI(`${constants.AzDoProjectURL}/_apis/wit/workitems/$bug?api-version=6.0`);
        const requestBody = [
            {
                op: "add",
                path: "/fields/System.Title",
                value: name,
            },
            {
                op: "add",
                path: "/fields/System.Description",
                value: description,
            },
            {
                op: "add",
                path: "/relations/-",
                value: {
                    rel: "Hyperlink",
                    url: link,
                },
            },
        ];
        try {
            return await doAzDoRequest(url, "POST", requestBody);
        } catch (error) {
            console.log(`Failed to create bug in Azure DevOps: ${error}`);
        }
    }

    async function doqTestRequest(url, method, requestBody) {
        const qTestHeaders = {
            "Content-Type": "application/json",
            Authorization: `bearer ${constants.QTEST_TOKEN}`,
        };
        const opts = {
            url: url,
            json: true,
            headers: qTestHeaders,
            body: requestBody,
            method: method,
        };

        return new Promise((resolve, reject) => {
            request(opts, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode < 200 || response.statusCode >= 300) reject(`HTTP ${response.statusCode}`);

                resolve(body);
            });
        });
    }

    async function doAzDoRequest(url, method, requestBody) {
        const basicToken = Buffer.from(`:${constants.AZDO_TOKEN}`).toString("base64");

        const opts = {
            url: url,
            json: true,
            headers: {
                "Content-Type": "application/json-patch+json",
                Authorization: `basic ${basicToken}`,
            },
            body: requestBody,
            method: method,
        };

        return new Promise((resolve, reject) => {
            request(opts, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode < 200 || response.statusCode >= 300) reject(`HTTP ${response.statusCode}`);

                resolve(body);
            });
        });
    }
};
