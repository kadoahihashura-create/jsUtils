import fs from "fs";
import path from "path";

const fsp = fs.promises;

async function convertValue(value, directory) {

	value = value.trim();

	// Referência para arquivo
	if (value.startsWith("*")) {

		const filePath = value.slice(1).trim();

		if (!filePath) {
			throw new Error("Empty file reference!");
		}

		const fullPath = path.resolve(directory, filePath);

		let stat;

		try {
			stat = await fsp.stat(fullPath);
		} catch {
			throw new Error(`Couldn't find referenced file: ${filePath}`);
		}

		if (!stat.isFile()) {
			throw new Error(`Referenced path is not a file: ${filePath}`);
		}

		return await fsp.readFile(fullPath, "utf8");
	}

	// Array
	if (value.startsWith("[") && value.endsWith("]")) {

		const content = value.slice(1, -1).trim();

		if (!content) {
			return [];
		}

		return await Promise.all(
			content
				.split(",")
				.map(item => convertValue(item, directory))
		);
	}

	// Number
	if (value !== "" && !isNaN(value)) {
		return Number(value);
	}

	return value;
}

async function parseFile(filePath) {

	const fileDirectory = path.dirname(filePath);
	const file = await fsp.readFile(filePath, "utf8");
	const ret = {};

	for (const line of file.split(/\r?\n/)) {

		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const separator = trimmed.indexOf("=");

		if (separator === -1) {
			continue;
		}

		const key = trimmed.slice(0, separator).trim();

		const value = trimmed
			.slice(separator + 1)
			.trim()
			.replaceAll("\\n", "\n");

		if (!key) {
			continue;
		}

		ret[key] = await convertValue(value, fileDirectory);
	}

	return ret;
}

async function findIndieFile() {

	const paths = [
		path.resolve("./.ind"),
		path.resolve("../.ind")
	];

	for (const filePath of paths) {

		try {
			const stat = await fsp.stat(filePath);

			if (stat.isFile()) {
				return filePath;
			}
		} catch {
			// Tenta o próximo caminho.
		}
	}

	throw new Error("Couldn't find the indie file!");
}

// Localiza e carrega o arquivo inicial.
const filePath = await findIndieFile();
const ret = await parseFile(filePath);

// Controle do hot reload.
const RELOAD_INTERVAL = 1000;

let reloading = false;
let stopped = false;

async function reload() {

	// Evita execuções simultâneas.
	if (reloading || stopped) {
		return;
	}

	reloading = true;

	try {

		const newValues = await parseFile(filePath);

		// Remove propriedades que deixaram de existir.
		for (const key of Object.keys(ret)) {

			if (!Object.hasOwn(newValues, key)) {
				delete ret[key];
			}
		}

		// Atualiza as propriedades existentes e adiciona novas.
		Object.assign(ret, newValues);

	} catch (error) {

		// Mantém os valores anteriores caso a leitura falhe.
		console.error("[indie] Hot reload failed:", error.message);

	} finally {
		reloading = false;
	}
}

const reloadTimer = setInterval(reload, RELOAD_INTERVAL);

// Permite encerrar o hot reload manualmente.
export function stopHotReload() {

	stopped = true;
	clearInterval(reloadTimer);
}

// O objeto exportado permanece o mesmo durante toda a execução.
export default ret;