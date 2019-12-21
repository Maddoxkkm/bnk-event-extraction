## WARNING! This is only a Proof Of Concept project. This project is never suitable for production and will cause a lot of issues.
# Concept of an event-based extractor for Wwise Soundbanks.
This is an event-based extractor for Wwise soundbanks (.bnk format). I've made it in an attempt to extract voicelines from the popular game **World of Tanks**.
## Why the need?
As you may've already known, most of the extractors out there in the web only extracts the .wem files without any structure, and without a proper name for the extracted .wem files, it's often very difficult to tell what the sound is for, and how does it relate to a certain event. It could be because the sound is of a different locale (I can't understand anything russian so....), or the sounds are simply too short to figure out it's use.

## How does this extractor help?
This extractors attempts to find the relationship between each embedded .wem file with their events alongside with any intermediate containers, and extracts them in a manner that preserve such parent/children relationship.

## Assumptions
HIRC Objects that are the type `01` and `07` are not useful to the extraction. 
- `01` only describes the setting of some sort and contains no useful data in an event-based extraction
- `07` is Actor-Mixer and since it only contains other containers but not anything directly related to the event in any useful manner I've decided it also contains no useful data in an event-based extraction.

Since some containers may contain cross-reference of each other (for settings or some other reason, which I have not been able to identify), I've forbid the search of event ids to the HIRC objects that are the same type.
- long story short, if an HIRC Object is the type of `05`, for example, It will not conduct any search towards HIRC Objects that are also the type of `05`.

## Difficulties
Most of the resources out there in the internet are outdated (or contained insufficient data useful for this topic, or outdated data): 
- http://wiki.xentax.com/index.php/Wwise_SoundBank_(*.bnk)
- https://koreanrandom.com/forum/topic/31848-wwise-%D0%BF%D0%BE%D1%81%D0%BE%D0%B1%D0%B8%D0%B5-%D0%BF%D0%BE-%D1%81%D0%BE%D0%B7%D0%B4%D0%B0%D0%BD%D0%B8%D1%8E-%D0%B7%D0%B2%D1%83%D0%BA%D0%BE%D0%B2%D1%8B%D1%85-%D0%BC%D0%BE%D0%B4%D0%BE%D0%B2/?do=findComment&comment=329704

This lack of prior knowledge impacted a lot on how I've decided to lay out this program, so there's lot of guessing involved. one of the solutions I've managed to come up with is to conduct a brute force search for the child (which is very inappropriate and inaccurate), applying the restrictions mentioned in assumptions section.

Different .bnk version also contributed as a difficulty, but I've ignoed as my goal is to only create the extractor for `voiceover.bnk` specifically. I've attached the sample of it here. This file asset belongs to Wargaming.net.

## More explanation on the brute force solution
For each HIRC object, it starts with an identifer, which tells what the object is for. for example a `02` indicates a Sound SFX object which contains the id to the .wem it is holding, or `04` indicates an event so it contains event actions (`03`s).

So within each of the objects, there should be some sort of reference to it's child. Taking advantage of this, for each object that I have no idea how to find the child, it first compiles a set of potential ids that it can look for (an id is a uint32le.), and conducts a search within all other HIRC objects to match their ids with the potential list of ids. that way we can obtain one's child without knowing it's structure. 

But there's a catch. while digging around within the buffers of the contents of some of the HIRC Objects, I believe I've came accross a few scenarios where `07` Objects are being referenced from all over the place, and it contains reference to also all over the place. Obviously you don't want this as it will create a lot of mess in the child/parent structure, and it's not desirable to have this big mass of connection that connects you to all over the place. In order to eliminate this, I exclude `07` from the HIRC structure **completely**. a few digging tells me that `07` objects are sort of like a top-level category, where you can create settings and apply to all of the childs. I've determined it's useless within an event-based extraction and removed it.

# How to use
- Download latest node.js
- clone this repo
- do a quick `npm i` to install the dependencies
- run `npm run-script run` to run the demo.
- Optionally run `wem_convert.bat` to convert all the `.wem` files to `.wav` files that can be played