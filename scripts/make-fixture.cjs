const JSZip = require("jszip");
const fs = require("fs");

const FOLDER = "{11111111-1111-4111-8111-111111111111}";
const CH1 = "{22222222-2222-4222-8222-222222222222}";
const CH2 = "{33333333-3333-4333-8333-333333333333}";
const P1 = "{44444444-4444-4444-8444-444444444444}";

const note = (p, v, s, l) => `<Note pitch="${p}" velocity="${v}" start="${s}" length="${l}"/>`;

const song = `<?xml version="1.0" encoding="UTF-8"?>
<Song version="6.5" name="Smoke Test">
  <Attributes x:id="Root">
    <Attributes x:id="timeContext">
      <TempoMap><Tempo value="128"/></TempoMap>
      <TimeSignatureMap><TimeSignature numerator="4" denominator="4"/></TimeSignatureMap>
    </Attributes>
    <List x:id="Tracks">
      <FolderTrack name="Drums" trackID="${FOLDER}" color="-2581248"/>
      <MediaTrack name="Kick" trackID="{55555555-5555-4555-8555-555555555555}" mediaType="Music" parentFolder="${FOLDER}" color="-16744448">
        <UID x:id="channelID" uid="${CH1}"/>
        <List x:id="events">
          <MusicPart clipID="${P1}" name="Verse" start="0" length="3840" color="-16744448">
            <List x:id="notes">
              ${note(36, 110, 0, 240)}${note(36, 96, 480, 240)}${note(36, 100, 960, 240)}${note(36, 104, 1440, 240)}
            </List>
          </MusicPart>
        </List>
      </MediaTrack>
      <MediaTrack name="Bass" trackID="{66666666-6666-4666-8666-666666666666}" mediaType="Music" color="-16776961">
        <UID x:id="channelID" uid="${CH2}"/>
        <List x:id="events">
          <MusicPart clipID="{77777777-7777-4777-8777-777777777777}" name="Groove" start="0" length="3840">
            <List x:id="notes">
              ${note(40, 90, 0, 480)}${note(43, 90, 480, 480)}${note(45, 90, 960, 480)}${note(47, 90, 1440, 480)}
            </List>
          </MusicPart>
        </List>
      </MediaTrack>
    </List>
  </Attributes>
</Song>`;

const synths = `<?xml version="1.0" encoding="UTF-8"?>
<AudioSynthFolder>
  <Attributes x:id="d1" name="Bass">
    <Attributes x:id="deviceData" name="Bass">
      <UID x:id="uniqueID" uid="${CH2}"/>
    </Attributes>
    <Attributes x:id="ghostData" presetType="1">
      <Attributes x:id="classInfo" name="Analog" category="Instrument" subCategory="(Native)/Synth"/>
    </Attributes>
    <String x:id="presetPath" text="Factory/Bass/Analog"/>
  </Attributes>
</AudioSynthFolder>`;

const musictrack = `<?xml version="1.0" encoding="UTF-8"?>
<MusicTrackDevice>
  <Attributes x:id="channels">
    <ChannelGroup name="MusicTrack">
      <MusicTrackChannel color="-16776961">
        <UID x:id="uniqueID" uid="${CH2}"/>
        <Connection x:id="instrumentOut" friendlyName="Analog" objectID="${CH2}"/>
      </MusicTrackChannel>
    </ChannelGroup>
  </Attributes>
</MusicTrackDevice>`;

const mixer = `<?xml version="1.0" encoding="UTF-8"?>
<AudioMixer>
  <Attributes x:id="channels">
    <ChannelGroup name="Channels">
      <Channel name="Bass">
        <UID x:id="uniqueID" uid="${CH2}"/>
        <Attributes x:id="Inserts">
          <Attributes x:id="FX1" name="FX1">
            <Attributes x:id="ghostData">
              <Attributes x:id="classInfo" name="Pro EQ" category="Effect" subCategory="(Native)/EQ"/>
            </Attributes>
          </Attributes>
          <Attributes x:id="FX2" name="FX2">
            <Attributes x:id="ghostData">
              <Attributes x:id="classInfo" name="ValhallaVintageVerb" category="Effect" subCategory="Reverb"/>
            </Attributes>
          </Attributes>
        </Attributes>
      </Channel>
    </ChannelGroup>
  </Attributes>
</AudioMixer>`;

(async () => {
  const zip = new JSZip();
  zip.file("Song/song.xml", song);
  zip.file("Song/mediapool.xml", '<?xml version="1.0"?><MediaPool/>');
  zip.file("Devices/audiosynthfolder.xml", synths);
  zip.file("Devices/musictrackdevice.xml", musictrack);
  zip.file("Devices/audiomixer.xml", mixer);
  zip.file("metainfo.xml", '<?xml version="1.0"?><MetaInformation><Attribute x:id="Document:Title" value="Smoke Test"/></MetaInformation>');
  zip.file("artwork.png", Buffer.from("89504e470d0a1a0a", "hex"));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.mkdirSync("fixtures", { recursive: true });
  fs.writeFileSync("fixtures/smoke.song", buf);
  console.log("fixture", buf.length, "bytes");
})();
