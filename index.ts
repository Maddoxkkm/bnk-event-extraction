import * as buffer from 'buffer'
import * as fs from 'fs'
import { countBy } from 'lodash'

const outPath = "./EXTRACTED/"

// grab list of events and make a dictionary
const events: string[] = fs.readFileSync('./events.txt').toString('utf8').split('\r\n');
const reverseHashTable: fvnTable = {}

events.forEach(event => {
    reverseHashTable[fnv_1(event)] = event
})


console.log(process.argv)

// console.log(reverseHashTable)
console.log("Reverse Hash Table for event names.... Complete")

// read voiceover buffer
const bnkBuffer: Buffer = fs.readFileSync('./voiceover.bnk')

function recursivelyEvaluateBnk(buf: Buffer): bnkBreakDown {
    let bnkPointer: number = 0
    const bufResults = {}

    while (bnkPointer < buf.length) {
        const identifier: Buffer = buf.subarray(bnkPointer, bnkPointer + 4);
        bnkPointer += 4;

        const contentLength: number = buf.readUInt32LE(bnkPointer);
        bnkPointer += 4;

        const bufContent: Buffer = buf.subarray(bnkPointer, bnkPointer + contentLength);
        bnkPointer += contentLength;
        bufResults[identifier.toString()] = { contentLength, bufContent }
    }
    return bufResults
}

function recursivelyEvaluateBnkArray(buf: Buffer, identifierSize: number = 4): bnkList[] {
    let bnkPointer: number = 0
    const bufArray: bnkList[] = []

    while (bnkPointer < buf.length) {
        const identifier: string = buf.subarray(bnkPointer, bnkPointer + identifierSize).toString('hex');
        bnkPointer += identifierSize;

        const contentLength: number = buf.readUInt32LE(bnkPointer);
        bnkPointer += 4;

        const bufContent: Buffer = buf.subarray(bnkPointer, bnkPointer + contentLength);
        bnkPointer += contentLength;
        bufArray.push({ identifier, contentLength, bufContent })
    }
    return bufArray
}

const bnkObj: bnkBreakDown = recursivelyEvaluateBnk(bnkBuffer)

if (bnkObj?.BKHD?.contentLength && bnkObj?.BKHD?.bufContent) {
    // BKHD manipulation
    // TBH this part isn't important at all - can be ignored
    // Wiki is outdated so it can be left untouched.
}

if (bnkObj?.DIDX?.contentLength && bnkObj?.DIDX?.bufContent) {
    const { contentLength, bufContent } = bnkObj.DIDX;
    bnkObj.DIDX.dict = {}
    // DIDX manipulation
    // Dictionary where the .wem raw data will be stored in DATA section. (start & finish)
    let dictPointer: number = 0;

    while (dictPointer < contentLength) {
        const wemID: number = bufContent.readUInt32LE(dictPointer);
        const startByte: number = bufContent.readUInt32LE(dictPointer + 4);
        const wemSize: number = bufContent.readUInt32LE(dictPointer + 8);
        const endByte: number = wemSize + startByte

        dictPointer += 12;
        bnkObj.DIDX.dict[wemID] = { startByte, wemSize, endByte }
    }
}

if (bnkObj?.HIRC?.contentLength && bnkObj?.HIRC?.bufContent) {
    // HIRC manipulation
    // This part is the hardest part. dealing with binary encoded data is headache fuck

    const { contentLength, bufContent } = bnkObj.HIRC
    // now just destroy the bufContent on the bnk Obj (no dumps)
    bnkObj.HIRC.bufContent = undefined;

    // first LE UINT32 describes the number of events
    const objCount: number = bufContent.readUInt32LE(0)

    const HIRCSet: HIRCList[] = recursivelyEvaluateBnkArray(bufContent.subarray(4), 1)
        .map((object: bnkList): HIRCList => {
            return {
                identifier: object.identifier,
                contentLength: object.contentLength,
                id: object.bufContent.readUInt32LE(0),
                name: reverseHashTable[object.bufContent.readUInt32LE(0).toString()] ? reverseHashTable[object.bufContent.readUInt32LE(0).toString()] : object.identifier + '_' + object.bufContent.readUInt32LE(0).toString(),
                idBuf: object.bufContent.subarray(0, 4),
                bufContent: object.bufContent.subarray(4)
            }
        })

    const eventTypeCounter = countBy(HIRCSet.map(x => x.identifier))

    // console.log(eventTypeCounter)

    // 07s are actor-mixers. they are pointless in an event-based extraction and will add huge amounts of complexity in brute forced solutions.
    bnkObj.HIRC.list = HIRCSet.filter(hirc => hirc.identifier !== "07")

    // Now let's run the actual recursive exporter. We should have maximum information by now.
    HIRCSet.filter(item => item.identifier === "04").forEach(event => recursivelyExportFoldersAndWems(event, new Set(), HIRCSet, outPath, 3, bnkObj.DATA?.bufContent))
}

/**
 * recursively export wem files and events and their sub-objects. 
 * depth for folder generation is defaulted at 1. so it generates all of the event folders at least. function must be called on an event (04 identifier), since this is an extractor based on events after all.
 * identifiers with unknown content will be brute forced. so there's margin of error to be expected.
 * brute force solutions do not consider the object of the same identifier as child. for example an object with 05 type, will never find from 05 types a child (also assumption)
 * also made sure parent back-tracing is not allowed (finding an id that exists but it's the parent and calls it backwards.), especially under brute forced solutions.
 */
async function recursivelyExportFoldersAndWems(hircObj: HIRCList, parentIDs: Set<number>, wholeHIRC: HIRCList[], curPath: string, depthforFolder: number = 1, DATABuffer: Buffer): Promise<void> {
    // if the number reaches 0, create folders recursively and forget.
    if (depthforFolder <= 0) await fs.promises.mkdir(curPath, { recursive: true });
    let newPath: string = curPath;

    switch (hircObj.identifier) {
        // Top level 04 (events, which should be top-levels.)
        case "04":
            // 04 can contain multiple childs. 1st byte indicates the number of childs. ez.
            // all the following bytes are uint32le for child ids.
            newPath = depthforFolder > 0 ? `${curPath}/${hircObj.name}` : curPath

            const numofChilds: number = hircObj.bufContent.readUIntLE(0, 1);
            for (let i = 0; i < numofChilds; i++) {
                const childID: number = hircObj.bufContent.readUInt32LE(4 * i + 1)
                const childFound: HIRCList[] = wholeHIRC.filter(item => childID === item.id && !parentIDs.has(item.id))
                childFound.forEach(async child => {
                    await recursivelyExportFoldersAndWems(child,
                        parentIDs.add(hircObj.id),
                        wholeHIRC,
                        newPath,
                        depthforFolder - 1,
                        DATABuffer)
                })
            }
            break;

        case "03":
            // 03 only has 1 child - proof me wrong otherwise. it exists on the 3rd byte as uint32le. Still pretty easy.
            // since it only has single child, so only if the bool is enabled otherwise it's not going to export any folders. ez to understand?
            newPath = curPath

            const child: number = hircObj.bufContent.readUInt32LE(2)
            wholeHIRC.filter(item => item.id === child && !parentIDs.has(item.id))
                .forEach(async child => {
                    await recursivelyExportFoldersAndWems(child,
                        parentIDs.add(hircObj.id),
                        wholeHIRC,
                        newPath,
                        depthforFolder, // if it wants to export single child folders, count on him.
                        DATABuffer)
                })
            break;

        case "02":
            // 02 has it's wemID on the 6th byte as... you guessed it! uint32le. ez pz. now export that shit you motherfucker.
            // and also, regardless of whether you've reached 0 or not in depthforFolder, it just exports the wem file. no need for fancy shits.
            // Hmm how about check parent. let's see if it really is the true parent.
            // if (!parentIDs.has(hircObj.bufContent.readUInt32LE(21))) return
            const wemID: number = hircObj.bufContent.readUInt32LE(5);
            if (bnkObj.DIDX?.dict) {
                // if the dictionary even exists, den grab the start and end bytes.
                const { startByte, endByte, wemSize } = bnkObj.DIDX?.dict?.[wemID];
                // once we know the startByte and endByte, now grab the buffer.
                const wemBuffer: Buffer | undefined = DATABuffer.subarray(startByte, endByte)
                // Export the wemBuffer as an actual wem file. now we reached the end.
                if (wemBuffer != undefined) {
                    await fs.promises.writeFile(`${curPath}/${hircObj.id}.wem`, wemBuffer)
                        .catch(() => console.log("failed?"));
                    console.log(`success: file ${hircObj.id}.wem has been written to ${curPath}, with the size of ${wemSize} bytes.`);
                }
            }
            break;

        case "07":
            // 07s are actor-mixers. they are pointless in an event-based extraction and will add huge amounts of complexity in brute forced solutions.
            break;

        case "01":
            // 01 are bank settings. bank settings are irrelevant. stop right there.
            break;

        default:
            // oh no we've reached the most dangerous area in this program - brute forces. This is going to be ugly, but hopefully worth it and actually works.
            // and because there's so many object ids that are unknown, I think it's best to just fuck it and not disable it.
            // warn this via console.
            console.log(`id ${hircObj.id} has an Object type ("${hircObj.identifier}") with unknown content. It's impossible to locate Child Object with standard method. Brute Force solution is employed, but be aware of unexpected results. It will also feel a bit slower from here on it. hang on.`)

            newPath = depthforFolder > 0 ? `${curPath}/${hircObj.name}` : curPath;
            // create a set to condense the sets of potential ids we will have to look for.
            const bruteForceIDSet: Set<number> = new Set();
            // now loop finding ids, because ids are 4 bytes so -4.
            for (let i = 0; i < hircObj.bufContent.length - 4; i++) {
                bruteForceIDSet.add(hircObj.bufContent.readUInt32LE(i));
            }

            // generate new set of hircs that does not contain the same identifier, and is not the parent who called this instance of the function. 
            // this is where loop backs or same level references are cut off.
            // This assumes that you cannot put an object of one type as the child of another object that is the same type. Which idek if it's possible or not. kek. guess we'll find out.
            const targetHIRCs: HIRCList[] = wholeHIRC.filter(item =>
                item.identifier !== hircObj.identifier && 
                !parentIDs.has(item.id)
            );

            // now test each id, where the real brute force begins.
            bruteForceIDSet.forEach(potentialID => {
                targetHIRCs.filter(item =>
                    item.id === potentialID
                ).forEach(async item => {
                    // well, it matched, and if it really passed those harsh conditions, it means it's 95% the real child. surely.
                    console.log(`id ${hircObj.id} has found a plausible child ${item.id}. Proceeding with next level explorations.`)
                    await recursivelyExportFoldersAndWems(item, parentIDs.add(hircObj.id), wholeHIRC, newPath, depthforFolder - 1, DATABuffer)
                })
            });
            break;
    }

}
// Test wem dump
// fs.writeFileSync('./576348.wem', bnkObj?.DATA?.bufContent?.subarray(0, 14659))
// fs.writeFileSync('./1106133.wem', bnkObj?.DATA?.bufContent?.subarray(14672, 48741))

// What's between the empty dumps?
// console.log(bnkObj?.DATA?.bufContent?.slice(14660,14671))
// <Buffer 00 00 00 00 00 00 00 00 00 00 00>

// console.log(bnkObj)

// preparation to write to dump
bnkObj.DATA.bufContent = undefined
bnkObj.HIRC.bufContent = undefined
bnkObj.DIDX.bufContent = undefined

// now we can write to dump without fear
fs.writeFileSync('./bnkdump.json', JSON.stringify(bnkObj, undefined, 1))


// Type definitions and side functions (that are important for me to develop)
interface bnkBreakDown {
    [header: string]: {
        contentLength: number,
        bufContent?: Buffer
    },
    DIDX?: {
        contentLength: number,
        bufContent?: Buffer,
        dict: {
            [wemID: number]: {
                startByte: number,
                wemSize: number,
                endByte: number
            }
        }
    }
    HIRC?: {
        contentLength: number,
        bufContent?: Buffer,
        list?: bnkList[]
    }
}

interface bnkList {
    identifier: string,
    contentLength: number,
    bufContent?: Buffer
}

interface HIRCList extends bnkList {
    id: number,
    name: string,
    idBuf: Buffer,
    bufContent: Buffer
}

interface fvnTable {
    [hash: number]: string
}

/**
 * Function yoinked from fnv32 library because it did not contain a index.d.ts ¯\_(ツ)_/¯
 * made a modification to use newer methods to create buffer.
 * @param data data to be hashed
 */
function fnv_1(data: string | Buffer): number {
    if (typeof data === 'string') {
        data = buffer.Buffer.from(data);
    }

    if (!Buffer.isBuffer(data)) {
        throw new Error('fnv32 input must be a String or Buffer.');
    }

    var hashint = 2166136261;

    for (var i = 0; i < data.length; i++) {
        hashint += (hashint << 1) + (hashint << 4) + (hashint << 7) + (hashint << 8) + (hashint << 24);
        hashint = hashint ^ data[i];
    }

    return hashint >>> 0;    // unsigned 32 bit integer.
};