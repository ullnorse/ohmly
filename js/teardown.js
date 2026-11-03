/* Teardown: one real open-source board, ull-pocket rev 0.8, taken apart part by part.
   Board geometry: data/ull-pocket.json, made by tools/kicad2ohmly.py from the KiCad file and fetched on first visit.
   Content below: blocks, part cards, net notes and design notes. Everything on the board is addressed by ref ("U7")
   or net name ("+3V3"); the view state is a set of highlighted refs and nets, so later layers (time axis, stories,
   probe) can drive it through BC.TD.show({refs, nets}). */
(function(){
const BC=window.BC, {$,$$,esc}=BC;
const TD=BC.TD={};
const SRC="https://github.com/ullnorse/ull-pocket";

/* ---------- content ---------- */
TD.BLOCKS=[["power","Power"],["mcu","MCU and radio"],["sens","Sensors"],["disp","Display"],["input","Input"],["led","LEDs"],["conn","Connectors"]];
const BLOCK_OF={
  power:"ASSY2 U6 U7 U5 Q2 R11 R13 TH1 R8 R9 R10 R4 R5 R7 R12 C2 C3 C4 C5 C6 C7 C16",
  mcu:"U1 C8 C9 R15 C10",
  sens:"U2 U3 U4 R17 R18 C11 C12 C13 C14 C15",
  disp:"ASSY1 J3 L1 Q1 D2 D3 D4 R19 R20 R25 R26 C17 C19 C18 C20 C21 C22 C23 C24 C25 C26",
  input:"SW1 SW2 SW3 R14 R28 C27 R29 R30 C28 R24 R31 C29",
  led:"D5 D1 D6 R21 R6 R32 R33 R22 R16",
  conn:"J1 U8 R1 R2 R3 C1 J2 J4 R27 TP1 TP2 TP3 TP4 TP5 H1 H2"};
const blockOf={}; Object.entries(BLOCK_OF).forEach(([b,s])=>s.split(" ").forEach((r,i)=>blockOf[r]=[b,i]));

/* part cards: t title, d role (2-4 sentences), k key numbers [label, value], m Ohmly links [module, lab?].
   Numbers come from the board's own notes (PARTS.md, docs/) or the part's datasheet; nothing here is estimated. */
const P={
 U1:{t:"ESP32-C6 module",d:"The processor and the radio. The module already holds the ESP32-C6 chip, 4 MB of flash, the crystal and the antenna matching, so the board supplies only 3.3 V, decoupling and wiring. It sleeps most of the time; a button, the accelerometer, the fuel-gauge alert or a timer wakes it.",
  k:[["Radios","Wi-Fi 6, BLE, 802.15.4"],["Flash","4 MB"],["Module","13.2 × 16.6 mm"],["Antenna","5.4 mm past the top edge"],["USB","built-in serial/JTAG"]],m:[[12]]},
 U2:{t:"SHT40 temperature and humidity",d:"Measures temperature and relative humidity. It sits on an island cut free by a milled moat, so heat from the radio, charger and regulator can't reach it through copper. Four 0.15 mm tracks cross the bridge: SDA, SCL, GND and 3.3 V.",
  k:[["I²C address","0x44"],["Accuracy","±0.2 °C, ±1.8 %RH typ."],["Package","DFN-4, 1.5 × 1.5 mm"],["Island","4.15 × 3.9 mm, 1.0 mm moat"]],m:[[12]]},
 U3:{t:"BMP580 pressure sensor",d:"Measures air pressure, which the firmware turns into altitude or a weather trend. CSB tied to 3.3 V selects I²C, and SDO tied to ground sets the address. Its interrupt floats until the firmware enables it, so it is set push-pull, active low, before the chip sleeps.",
  k:[["I²C address","0x46"],["Interrupt","BARO_INT, IO4"],["Package","LGA-10, 2 × 2 mm, 0.5 mm pitch"]],m:[[12]]},
 U4:{t:"LIS2DW12 accelerometer",d:"Senses motion and doubles as a wake source: INT1 drives ACC_INT1, a low-power GPIO, so a tap or a tilt wakes the chip from deep sleep. INT1 is active-high out of reset; the firmware makes it active-low like the other wake lines.",
  k:[["I²C address","0x19 (SA0 high)"],["Full scale","±2 to ±16 g"],["Interrupt","ACC_INT1, IO3"],["Package","LGA-12, 2 × 2 mm"]],m:[[12]]},
 U5:{t:"MAX17048 fuel gauge",d:"Reports the cell's state of charge over I²C. It models the cell from its voltage alone, so there is no current-sense resistor in the battery path. Its alert wakes the chip on a low cell; the firmware clears it before sleeping, or the chip wakes at once.",
  k:[["I²C address","0x36"],["Hibernate","3 µA"],["Alert","BAT_ALRT_N, IO0"],["Package","DFN-8, 2 × 2 mm"]],m:[[12]]},
 U6:{t:"BQ24073 charger and power path",d:"Charges the LiPo from USB and runs the board at the same time. With USB present its OUT pin (VSYS) is held at 4.4 V and the cell charges behind it; unplugged, VSYS follows the cell. R9 sets the charge current, and TH1 under the cell stops charging when the cell is too cold or too hot.",
  k:[["Charge current","about 270 mA (R9 = 3.3 kΩ)"],["Charge voltage","4.2 V"],["VSYS on USB","4.4 V"],["Charge window","3.5 to 47 °C nominal"],["Thermal pad","1.68 mm, 5 vias"]],m:[[9],[21]]},
 U7:{t:"RT9080 3.3 V regulator",d:"Makes the 3.3 V rail from VSYS. A linear regulator burns (Vin − Vout) × I as heat, but from a 3.7 V cell that is about 11% of the power, and its 2 µA quiescent current barely touches the battery in sleep. Its output reaches +3V3 through R13.",
  k:[["Quiescent current","about 2 µA"],["Output","3.3 V, up to 600 mA"],["Dropout margin","no Wi-Fi below about 3.55 V on the cell"],["Package","TSOT-23-5"]],m:[[9,"reg"]]},
 U8:{t:"USBLC6 ESD protection",d:"Clamps static discharge on the USB data lines and VBUS before it reaches the ESP32. It sits right behind the connector, so the surge takes the short path to ground.",
  k:[["IEC 61000-4-2","±15 kV air, ±8 kV contact"],["Lines","D+, D−, VBUS"],["Package","SOT-23-6"]],m:[[6]]},
 Q2:{t:"Reverse-polarity FET",d:"An N-MOSFET in the cell's negative lead. With the cell the right way round, R11 lifts the gate to VBAT and the channel shorts out the body diode. Plugged in backwards, the gate sits below the source, the FET stays off and the body diode blocks. On the low side an N-channel part needs no charge pump.",
  k:[["Part","AO3400A"],["Rating","30 V, 5.7 A"],["Vgs max","12 V; the cell is at most 4.2 V"],["Gate","100 kΩ (R11) to VBAT"]],m:[[7]]},
 R11:{t:"Q2 gate resistor",d:"Pulls Q2's gate up to VBAT, so the FET is on whenever the cell is the right way round. 100 kΩ costs almost nothing: the gate is insulated and draws no steady current.",m:[[7]]},
 R13:{t:"Sleep-current link",d:"A 0 Ω resistor between the regulator output and the 3.3 V rail. Remove it and connect an ammeter across its pads: everything on +3V3 then runs through the meter, so you read the board's sleep current.",m:[[3]]},
 TH1:{t:"Battery thermistor",d:"An NTC on the charger's TS pin. It sits under the cell with a 3 mm gap pad, so it tracks the cell's temperature. Most LiPo cells may be charged only up to 45 °C.",
  k:[["Value","10 kΩ at 25 °C, B = 3950"],["Charge window","3.5 to 47.2 °C nominal"],["Resume","6.5 / 44.7 °C"]],m:[[12,"ntc"]]},
 R8:{t:"TS fallback, not fitted",d:"A fixed 10 kΩ footprint in parallel with TH1, left empty. Fitted without TH1 it tells the charger the cell is always at 25 °C."},
 R9:{t:"Charge-current resistor",d:"Sets the charge current: the charger divides a fixed constant by this resistance. 3.3 kΩ gives about 270 mA, a gentle 0.45 C for a 600 mAh cell.",m:[[9]]},
 R10:{t:"Input-limit resistor",d:"Sets the charger's adjustable input current limit (ILIM)."},
 R4:{t:"EN1 divider, top",d:"R4 and R5 halve VBUS for the charger's EN1 pin. EN1 and EN2 pick the charger's input current mode."},
 R5:{t:"EN1 divider, bottom",d:"R4 and R5 halve VBUS for the charger's EN1 pin. EN1 and EN2 pick the charger's input current mode."},
 R7:{t:"Power-good pull-up",d:"The charger's PGOOD output is open-drain: it pulls USB_PGOOD_N low while USB power is good. The ESP32 reads it on IO1 and stays awake while a cable is plugged in, because USB is off in deep sleep.",m:[[12]]},
 R12:{t:"Fuel-gauge alert pull-up",d:"The gauge's alert output is open-drain. While an alert is active it holds the line low, and this 100 kΩ draws 33 µA from 3.3 V, one more reason the firmware clears it before sleeping.",m:[[12]]},
 C2:{t:"Charger input capacitor",d:"1 µF on VBUS at the charger's IN pin. It is rated 50 V, so a hot-plug spike on VBUS can't break it.",m:[[21,"decoup"]]},
 ASSY2:{t:"LiPo cell, bought separately",d:"A 503040 cell lying over the parts on a 3.5 mm shelf, so every part under it is at most 3.25 mm tall. Its leads plug into J2. Buy one with a protection board and check its plug polarity.",
  k:[["Capacity","600 mAh"],["Size","5 × 30 × 40 mm"],["Plug","JST-PH 2.0, pin 2 = +"]],m:[[9]]},

 C8:{t:"Module bulk capacitor",d:"22 µF on +3V3 next to the module. It covers the radio's current bursts, which are too fast for the regulator 30 mm away.",m:[[21,"decoup"]]},
 R15:{t:"EN pull-up",d:"R15 and C10 hold the module's EN low for a moment at power-up, so it starts only after 3.3 V has settled: τ = 10 kΩ × 1 µF = 10 ms.",m:[[5,"rc"]]},
 C10:{t:"EN delay capacitor",d:"R15 and C10 hold the module's EN low for a moment at power-up, so it starts only after 3.3 V has settled: τ = 10 kΩ × 1 µF = 10 ms. The pogo pads can pull EN low to reset.",m:[[5,"rc"]]},
 R17:{t:"I²C pull-up, SDA",d:"I²C lines are open-drain: chips only pull low, and this 10 kΩ pulls high. Four chips share the bus: U2 0x44, U3 0x46, U4 0x19, U5 0x36. 10 kΩ is too slow for 400 kHz, so the bus runs at 100 kHz, and a line left low in sleep wastes 330 µA.",
  k:[["Value","10 kΩ to 3.3 V"],["Bus speed","100 kHz"]],m:[[12],[19]]},
 R18:{t:"I²C pull-up, SCL",d:"I²C lines are open-drain: chips only pull low, and this 10 kΩ pulls high. Four chips share the bus: U2 0x44, U3 0x46, U4 0x19, U5 0x36. 10 kΩ is too slow for 400 kHz, so the bus runs at 100 kHz, and a line left low in sleep wastes 330 µA.",
  k:[["Value","10 kΩ to 3.3 V"],["Bus speed","100 kHz"]],m:[[12],[19]]},

 ASSY1:{t:"E-paper panel, bought separately",d:"A 1.54 inch, 200 × 200 black and white e-paper panel with an SSD1681 controller, taped to the bare back of the board. It keeps its image with no power, so the board can sleep with a reading on screen. Its flex tail wraps round the right edge into J3.",
  k:[["Panel","GDEY0154D67"],["Pixels","200 × 200"],["Glass","37.32 × 31.80 mm"]],m:[[12]]},
 J3:{t:"E-paper FPC socket",d:"24-pin, 0.5 mm pitch flex socket for the panel. The tail wraps 180° round the right edge, so its contacts face away from the board; a back-flip, top-contact socket keeps pin n on panel pin n. A rule area keeps parts off the tail's flat run.",
  k:[["Pins","24, 0.5 mm pitch"],["Height","2.0 mm"]],m:[[20]]},
 L1:{t:"E-paper boost inductor",d:"Part of the panel's boost converter, built as in the panel's reference circuit. Q1 switches L1, and D2–D4 with C19 turn the pulses into the panel's high positive and negative gate voltages, PREVGH and PREVGL.",
  k:[["Value","47 µH"],["Saturation","1 A"],["Resistance","579 mΩ"],["Size","4 × 4 × 3 mm, shielded"]],m:[[9]]},
 Q1:{t:"E-paper boost switch",d:"The panel's controller switches this N-MOSFET through GDR, charging L1 and dumping its energy into the D2–D4 pump. R20 in its source lets the controller sense the switch current on RESE.",m:[[7],[9]]},
 R19:{t:"Boost gate pull-down",d:"1 MΩ from Q1's gate to ground holds the switch off while the panel's controller is unpowered.",m:[[7]]},
 R20:{t:"Boost current sense",d:"2.2 Ω in Q1's source. The panel's controller reads the voltage across it on RESE to limit the switch current."},
 R25:{t:"Panel reset pull-up",d:"100 kΩ on EPD_RST_N keeps the panel out of reset while the ESP32 sleeps and its pins float.",m:[[19]]},
 R26:{t:"Panel select pull-up",d:"100 kΩ on EPD_CS_N keeps the panel deselected while the ESP32 sleeps and its pins float.",m:[[19]]},
 C17:{t:"Boost input capacitor",d:"4.7 µF on +3V3 beside L1. It supplies the boost converter's pulsed input current locally, so the pulses don't travel back along the rail.",m:[[21,"decoup"]]},
 C19:{t:"Charge-pump capacitor",d:"4.7 µF, 50 V, between the switch node and the diode pump. It moves charge from each switch pulse into PREVGH and PREVGL."},

 SW1:{t:"UP button",d:"A side-actuated switch on the left edge. A press pulls BTN_N (IO2) low through R28; IO2 is a low-power GPIO, so UP wakes the chip from deep sleep.",k:[["GPIO","IO2, wake source"],["Debounce","R14 × C27 = 10 ms"]],m:[[12]]},
 SW2:{t:"OK button",d:"A press pulls BTN2_N (IO5) low through R30; IO5 is a low-power GPIO, so OK wakes the chip from deep sleep. Same circuit as UP.",k:[["GPIO","IO5, wake source"],["Debounce","R29 × C28 = 10 ms"]],m:[[12]]},
 SW3:{t:"DN button and BOOT",d:"A press pulls BTN3_N (IO9) low. IO9 is not a low-power GPIO, so the firmware polls DN while awake. Held during power-up, it starts the ROM download mode for recovery flashing.",k:[["GPIO","IO9, polled; BOOT strap"],["Debounce","R24 × C29 = 1 ms"]],m:[[12]]},
 R24:{t:"IO9 strap and DN pull-up",d:"10 kΩ holds IO9 high so the chip boots from flash; DN pulls it low. With C29 the line settles in 1 ms, well inside the 10 ms EN delay, so IO9 reads high at reset unless DN is held.",m:[[12]]},

 D1:{t:"Charge LED, red",d:"Lights while the charger is charging: the charger's CHG output pulls its cathode low. Fed from VSYS through R6, so it is lit only on USB.",k:[["Current","(4.4 − 1.8) V / 2 kΩ ≈ 1.3 mA"],["Type","side-view, lens at the bottom edge"]],m:[[8,"led"]]},
 D5:{t:"Power LED, green",d:"Lit whenever USB supplies VBUS. On battery it is off and costs nothing.",k:[["Current","(5.0 − 2.6) V / 2 kΩ ≈ 1.2 mA"],["Type","side-view, lens at the bottom edge"]],m:[[8,"led"]]},
 D6:{t:"User LED, RGB",d:"Common anode to 3.3 V: a GPIO driven low lights its colour. Red is IO8, green IO15, blue IO14.",k:[["Red","1 kΩ (R32), about 1.5 mA"],["Green","1 kΩ (R33), about 0.7 mA"],["Blue","470 Ω (R22), about 1.5 mA"]],m:[[8,"led"]]},
 R16:{t:"IO8 pull-up",d:"Keeps IO8 high: the red LED stays off at reset, and IO8's boot strap reads high."},

 J1:{t:"USB-C receptacle",d:"Power and programming. R1 and R2, 5.1 kΩ on CC1 and CC2, tell the source this is a sink, so it turns on 5 V. Only USB 2.0 data is wired, straight to the ESP32's built-in USB. The mouth overhangs the bottom edge by 0.6 mm to meet a thin case wall.",
  k:[["CC pull-downs","5.1 kΩ each"],["Data","USB 2.0, D+ and D−"]],m:[[20]]},
 J2:{t:"Battery connector",d:"A JST-PH-compatible socket for the LiPo, facing the left edge. Pin 2 is BAT+, pin 1 BAT− through Q2. Cell makers don't agree on plug polarity, so check it before plugging in.",k:[["Pitch","2.0 mm"],["Pin 2","VBAT (+)"],["Pin 1","BAT_N (−), through Q2"]],m:[[7]]},
 J4:{t:"Programming pads",d:"Six round pads on the back for a pogo fixture: VREF, GND, EN, IO9/BOOT and UART0 TX and RX. VREF is fed through R27, so a programmer can sense 3.3 V but can't power the board.",k:[["Grid","2 × 3, 2.54 mm pitch"],["Pads","1.0 mm round"]],m:[[12]]},
 R27:{t:"VREF resistor",d:"1 kΩ from +3V3 to the pogo pad VREF. It lets a programmer read the target voltage and limits back-feed from it to about 1 mA."},
 R1:{t:"CC1 pull-down",d:"5.1 kΩ from CC1 to ground marks this board as a USB-C sink, so the source turns on VBUS.",m:[[20]]},
 R2:{t:"CC2 pull-down",d:"5.1 kΩ from CC2 to ground: the plug can go in either way round, so both CC pins need one.",m:[[20]]},
 R3:{t:"USB shield link",d:"0 Ω from the USB-C shell to ground. The case is plastic, so the shield is tied straight to ground."},
 C1:{t:"Shield RC option, not fitted",d:"An empty footprint kept for a metal case, where the shield would reach ground through an RC instead of R3."},
 H1:{t:"M2 mounting hole",d:"A 2.2 mm hole in the bottom strip. An M2 screw from the back goes into a boss on the front shell."},
 H2:{t:"M2 mounting hole",d:"A 2.2 mm hole in the bottom strip. An M2 screw from the back goes into a boss on the front shell."}};
/* debounce networks share one pattern */
[["R14","C27","R28","UP","BTN_N","IO2"],["R29","C28","R30","OK","BTN2_N","IO5"]].forEach(([pu,c,rs,b,net,io])=>{
  P[pu]={t:b+" pull-up",d:`100 kΩ holds ${net} high. A press pulls it low through ${rs}; on release ${pu} recharges ${c} with τ = 100 kΩ × 100 nF = 10 ms, so contact bounce never reaches ${io}.`,m:[[12]]};
  P[c]={t:b+" debounce capacitor",d:`100 nF on ${net}. With ${pu} it filters contact bounce: a press discharges it in about 10 µs through ${rs}, and it recharges over 10 ms.`,m:[[12]]};
  P[rs]={t:b+" series resistor",d:`100 Ω between the switch and ${net}. It limits ESD current from the button into ${io}.`,m:[[12]]};});
P.R31={t:"DN series resistor",d:"100 Ω between the switch and BTN3_N. It limits ESD current from the button into IO9.",m:[[12]]};
P.C29={t:"DN debounce capacitor",d:"100 nF on BTN3_N. With R24 (10 kΩ) it settles in 1 ms, short enough that the IO9 boot strap still reads high at reset.",m:[[12]]};
[["R6","D1"],["R21","D5"],["R32","D6 red"],["R33","D6 green"],["R22","D6 blue"]].forEach(([r,d])=>{ P[r]={t:"LED resistor, "+d,d:`Sets the current through ${d}: I = (supply − LED forward voltage) / R.`,m:[[8,"led"]]}; });

/* net notes, by KiCad net name */
const NN={
 "GND":"The return path for every current. A solid plane fills In1.Cu, pours cover F.Cu and B.Cu, and stitching vias tie them together.",
 "+3V3":"The 3.3 V rail, from U7 through R13. Tracks on F.Cu carry it between nearby parts, and a pour on In2.Cu spreads it under the whole board, reached by vias.",
 "VBAT":"The cell's positive terminal: J2 pin 2 to the charger's BAT pins, the fuel gauge and Q2's gate resistor.",
 "VSYS":"The charger's output: 4.4 V on USB, the cell voltage otherwise. It feeds the regulator and the charge LED.",
 "VBUS":"5 V from USB-C. It feeds the charger, the power LED and the ESD clamp; on In2.Cu it hops under other routing.",
 "/LDO_OUT":"The regulator's output, before R13. With R13 removed, an ammeter from here to +3V3 reads the whole board's current.",
 "/BAT_N":"The cell's negative lead, from J2 pin 1 to Q2's drain. Q2 joins it to ground only when the cell is the right way round.",
 "Net-(Q2-G)":"Q2's gate, pulled to VBAT by R11.",
 "/I2C_SDA":"I²C data, shared by U2, U3, U4 and U5. Open-drain: chips only pull low, and R17 pulls it up.",
 "/I2C_SCL":"I²C clock, shared by U2, U3, U4 and U5. Open-drain: chips only pull low, and R18 pulls it up.",
 "/USB_D+":"USB 2.0 data, from J1 through U8 to the module's built-in USB.",
 "/USB_D-":"USB 2.0 data, from J1 through U8 to the module's built-in USB.",
 "/EN":"The module's enable. R15 and C10 delay it at power-up; the pogo pads can pull it low to reset.",
 "/BTN_N":"The UP button, on IO2. Wakes the chip from deep sleep.",
 "/BTN2_N":"The OK button, on IO5. Wakes the chip from deep sleep.",
 "/BTN3_N":"The DN button and BOOT strap, on IO9. Polled while awake.",
 "/ACC_INT1":"Accelerometer interrupt to IO3, a deep-sleep wake source.",
 "/BARO_INT":"Pressure-sensor interrupt to IO4, a deep-sleep wake source.",
 "/BAT_ALRT_N":"Fuel-gauge alert to IO0, a deep-sleep wake source. Open-drain, pulled up by R12.",
 "/USB_PGOOD_N":"Low while USB power is good. On IO1, so the firmware can stay awake while a cable is in.",
 "/LED_R":"Red channel of D6, on IO8. Low turns it on.","/LED_G":"Green channel of D6, on IO15. Low turns it on.","/LED_B":"Blue channel of D6, on IO14. Low turns it on.",
 "Net-(U6-TS)":"The charger's TS pin and the thermistor TH1. The charger compares its voltage against a cold and a hot threshold.",
 "Net-(U6-ISET)":"Charge-current setting: R9 to ground.",
 "/EPD_PREVGH":"The panel's positive gate-drive supply, made by the boost and the D2–D4 pump.",
 "/EPD_PREVGL":"The panel's negative gate-drive supply, made by the boost and the D2–D4 pump."};

/* design notes: numbered pins on the board. x, y in board mm. */
TD.NOTES=[
 {t:"A sensor on an island",x:17.6,y:1.4,refs:["U2","C11"],nets:["/I2C_SDA","/I2C_SCL"],fit:[8.5,0,19.5,11],
  d:"The SHT40 reads high next to anything warm. Here it sits on a 4.15 × 3.9 mm island, cut free on three sides by a 1.0 mm milled slot. Only a 3 mm bridge with four 0.15 mm tracks joins it to the board, and a rule area keeps every copper pour off the island on all four layers, so little heat can creep in through copper. The module, the boost inductor and the charger are 9 to 30 mm away.",m:[[12],[21]]},
 {t:"Antenna past the edge",x:37.6,y:-2.7,refs:["U1"],nets:[],fit:[22,-7,40,13],
  d:"The module's PCB antenna hangs 5.4 mm past the top edge, as Espressif recommends: no copper on any layer near it, and nothing to detune it. The footprint's 15 mm keep-out falls entirely off the board. The cell is 14 mm away, the SHT40 island 10 mm.",m:[[20]]},
 {t:"Decoupling at the pin",x:21.6,y:1.2,refs:["C8","C9","C11","C12","C13","C14","C15","U1","U2","U3","U4"],nets:[],
  d:"Each chip gets its own capacitor right at its supply pin: C9 (100 nF) is 1.4 mm from the module's 3V3 pin, with C8 (22 µF) 3.1 mm away for the radio's bursts. C11 sits 1.0 mm from the SHT40, C12 and C13 within 1.7 mm of the BMP580, C14 1.9 mm from the accelerometer. Distances are pad centre to pad centre.",m:[[21,"decoup"],[19]]},
 {t:"Four layers, one ground",x:10.5,y:25.5,refs:[],nets:["GND"],stack:1,
  d:"F.Cu carries the parts and most signals. Under it, 0.1 mm of prepreg away, In1.Cu is a solid ground plane with no tracks at all, so every signal's return current flows right under it. In2.Cu carries the +3V3 pour, and B.Cu the rest of the routing with more ground. Stitching vias tie the grounds together.",m:[[21]]},
 {t:"Reverse-polarity FET, low side",x:5.2,y:15.9,refs:["Q2","R11","J2"],nets:["/BAT_N","Net-(Q2-G)"],
  d:"Battery plugs are easy to get backwards. Q2 sits in the negative lead: the right way round, R11 pulls its gate to VBAT and it conducts with a few tens of milliohms; backwards, it stays off and its body diode blocks. A series diode would do the same but drop 0.3 to 0.7 V of a 3.7 V cell.",m:[[7],[6]]},
 {t:"Measuring sleep current",x:38.6,y:36.2,refs:["R13","U7"],nets:["/LDO_OUT","+3V3"],
  d:"A board that sleeps lives or dies by microamps. R13 is a 0 Ω link between the regulator and the 3.3 V rail: lift it, put an ammeter across the pads, and the whole board's current runs through the meter. The regulator itself draws about 2 µA.",m:[[3],[9]]},
 {t:"Getting heat out of the charger",x:28.4,y:33.0,refs:["U6","C2","C3","C4"],nets:[],
  d:"A linear charger burns the difference: about (5 − 3.7) V × 270 mA ≈ 0.35 W while charging. U6's exposed pad carries five vias into the ground planes, which spread the heat. If it still runs hot, the charger throttles itself rather than failing.",m:[[9],[21]]}];

/* ---------- board data ---------- */
let BD=null, loading=null;
TD.load=()=>loading||(loading=fetch("data/ull-pocket.json").then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(d=>{ BD=index(d); return BD; }).catch(e=>{ loading=null; throw e; }));
function index(d){
  const ref={}, netPads=d.nets.map(()=>[]), fpNets={};
  d.fp.forEach((f,i)=>{ ref[f.ref]=f; f.i=i; const m=new Map(); f.pads.forEach(p=>{ if(!p[7]) return; netPads[p[7]].push([f,p]); if(!m.has(p[7])) m.set(p[7],[]); m.get(p[7]).push(p[0]); }); fpNets[f.ref]=m; });
  const netIx={}; d.nets.forEach((n,i)=>netIx[n]=i);
  return Object.assign(d,{ref,netPads,fpNets,netIx});
}
const netName=n=>n.replace(/^\//,"");
const isNC=n=>/^unconnected-/.test(n);
const hasPart=r=>BD&&BD.ref[r];
TD.title=r=>(P[r]&&P[r].t)||(BD&&BD.ref[r]&&BD.ref[r].desc)||r;

/* ---------- geometry to SVG paths ---------- */
const f2=v=>Math.round(v*100)/100;
const rot=(x,y,a)=>{ const r=a*Math.PI/180, c=Math.cos(r), s=Math.sin(r); return [x*c+y*s,-x*s+y*c]; };
function padPath(p){
  const [, sh, x, y, w, h, a, , , ex]=p;
  if(sh==="p") { let s=""; for(let i=0;i<ex.length;i+=2) s+=(i?"L":"M")+ex[i]+" "+ex[i+1]; return s+"Z"; }
  if(sh==="c"){ const r=w/2; return `M${f2(x-r)} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0Z`; }
  const hw=w/2, hh=h/2; let pts;
  const rr=sh==="o"?Math.min(hw,hh):sh==="rr"?Math.min(w,h)*(ex||.25):0;
  if(!rr) pts=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  else { pts=[]; const cs=[[hw-rr,-hh+rr,-90],[hw-rr,hh-rr,0],[-hw+rr,hh-rr,90],[-hw+rr,-hh+rr,180]];
    cs.forEach(([cx,cy,a0])=>{ for(let k=0;k<=3;k++){ const t=(a0+k*30)*Math.PI/180; pts.push([cx+rr*Math.cos(t),cy+rr*Math.sin(t)]); } }); }
  return pts.map((q,i)=>{ const [u,v]=rot(q[0],q[1],a); return (i?"L":"M")+f2(x+u)+" "+f2(y+v); }).join("")+"Z";
}
const ringPath=r=>{ let s=""; for(let i=0;i<r.length;i+=2) s+=(i?"L":"M")+r[i]+" "+r[i+1]; return s+"Z"; };
const circ=(x,y,r)=>`M${f2(x-r)} ${y}a${r} ${r} 0 1 0 ${f2(2*r)} 0a${r} ${r} 0 1 0 ${f2(-2*r)} 0Z`;
/* tracks grouped by width: one path per width keeps the DOM small */
function trackPaths(list,cls){ const by=new Map(); list.forEach(t=>{ const k=t[4]; by.set(k,(by.get(k)||"")+`M${t[0]} ${t[1]}L${t[2]} ${t[3]}`); });
  return [...by].map(([w,d])=>`<path class="${cls}" stroke-width="${w}" d="${d}"/>`).join(""); }
const LAYERS=[["F.Cu","F"],["In1.Cu","I1"],["In2.Cu","I2"],["B.Cu","B"]];
const SHOW_DEFAULT={"F.Cu":1,"In1.Cu":0,"In2.Cu":0,"B.Cu":1,silk:1,zones:1,refs:0};
const padOn=(p,show)=>p[8]==="*"||(p[8]==="F"?show["F.Cu"]:show["B.Cu"]);

function boardSVG(){
  const d=BD, W=d.meta.w, H=d.meta.h;
  const outline=d.outline.map(ringPath).join("");
  let layers="";
  [...LAYERS].reverse().forEach(([L,c])=>{
    const z=d.zones[L].map(r=>ringPath(r[1])).join("");
    const pads=L==="F.Cu"||L==="B.Cu"?d.fp.flatMap(f=>f.pads.filter(p=>p[8]===(L==="F.Cu"?"F":"B")).map(padPath)).join(""):"";
    layers+=`<g class="tdL tdL${c}" data-l="${L}">${z?`<path class="tdZone" d="${z}"/>`:""}${trackPaths(d.tracks[L],"tdTr")}${pads?`<path class="tdPad" d="${pads}"/>`:""}</g>`;
  });
  const thru=d.fp.flatMap(f=>f.pads.filter(p=>p[8]==="*").map(padPath)).join("");
  const vias=d.vias.map(v=>circ(v[0],v[1],v[2]/2)).join(""), drills=d.vias.map(v=>circ(v[0],v[1],v[3]/2)).join("")+d.holes.map(h=>circ(h[0],h[1],h[2]/2)).join("");
  const silk=s=>s.lines.map(l=>`M${l[0]} ${l[1]}L${l[2]} ${l[3]}`).join("");
  const txt=(t,x,y,a,sz)=>`<text x="${x}" y="${y}" font-size="${f2(sz*.9)}"${a?` transform="rotate(${-a} ${x} ${y})"`:""}>${esc(t)}</text>`;
  const silkTxt=d.silk.F.text.map(t=>txt(...t)).join("")+d.fp.filter(f=>f.silk&&f.side==="F").map(f=>txt(f.ref,...f.silk)).join("");
  const refs=d.fp.filter(f=>!/^ASSY/.test(f.ref)).map(f=>{ const w=f.bb[2]-f.bb[0], h=f.bb[3]-f.bb[1], s=f2(Math.max(.28,Math.min(1.2,Math.min(w,h)*.42)));
    return `<text x="${f2((f.bb[0]+f.bb[2])/2)}" y="${f2((f.bb[1]+f.bb[3])/2+s*.35)}" font-size="${s}">${f.ref}</text>`; }).join("");
  /* parts that hang past the edge (antenna, USB-C mouth, side buttons, LEDs): body outline, since copper stops at the edge */
  const over=d.fp.filter(f=>!/^ASSY/.test(f.ref)&&(f.bb[0]<-.05||f.bb[1]<-.05||f.bb[2]>W+.05||f.bb[3]>H+.05))
    .map(f=>`<rect x="${f.bb[0]}" y="${f.bb[1]}" width="${f2(f.bb[2]-f.bb[0])}" height="${f2(f.bb[3]-f.bb[1])}"/>`).join("");
  const u1=d.ref.U1, ant=u1&&u1.bb[1]<0?`<text class="tdAnno" x="${u1.x}" y="${f2(u1.bb[1]/2)}" font-size="1.1">ANTENNA</text>`:"";
  return `<defs><clipPath id="tdClip"><path d="${outline}" clip-rule="evenodd"/></clipPath></defs>
   <g id="tdBase"><path class="tdSub" d="${outline}" fill-rule="evenodd"/>
   <g clip-path="url(#tdClip)">${layers}</g>
   <g class="tdLthru">${thru?`<path class="tdPad" d="${thru}"/>`:""}<path class="tdVia" d="${vias}"/></g>
   <path class="tdDrill" d="${drills}"/>
   <g class="tdSilk"><path class="tdSilkL" d="${silk(d.silk.F)}"/><g class="tdSilkT">${silkTxt}</g></g>
   <g class="tdOver">${over}</g>${ant}<path class="tdEdge" d="${outline}"/><g class="tdRefs">${refs}</g></g>
   <g id="tdHi"></g>`;
}

/* ---------- view state ---------- */
const st={sel:null, refs:new Set(), nets:new Set(), show:{...SHOW_DEFAULT}, view:null, sheet:null};
TD.state=st;

/* ---------- page ---------- */
TD.page=()=>`<header class="stack tdHead"><h1 tabindex="-1">Teardown</h1><p class="lede muted">One open-source board design, part by part: ull-pocket rev 0.8, a pocket environment meter built round an ESP32-C6. Click a part to see its job on this board, or a track to follow its net through all four layers.</p></header>
 <div class="td" id="td" data-sheet="">
  <aside class="tdPane tdList" id="tdList" aria-label="Parts"><div class="tdLoading muted">Loading the board…</div></aside>
  <section class="tdBoard" aria-label="Board">
   <div class="tdBar" role="toolbar" aria-label="Board view">
    <div class="tdLayers" id="tdLayers"></div>
    <span class="sp"></span>
    <button class="iconBtn" type="button" data-z="out" aria-label="Zoom out" title="Zoom out (−)">−</button><button class="iconBtn" type="button" data-z="in" aria-label="Zoom in" title="Zoom in (+)">+</button><button class="btn tdFit" type="button" data-z="fit" title="Fit the board (0)">Fit</button>
   </div>
   <div class="tdStage" id="tdStage" tabindex="0" role="application" aria-roledescription="board view" aria-label="ull-pocket board. Arrow keys pan, plus and minus zoom, 0 fits, Escape clears the selection." aria-describedby="tdHover">
    <svg id="tdSvg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg><div class="tdPins" id="tdPins"></div>
   </div>
   <p class="tdHover label" id="tdHover">Drag to pan, wheel or pinch to zoom.</p>
  </section>
  <aside class="tdPane tdCard" id="tdCard" aria-label="Details" aria-live="polite"></aside>
  <div class="tdTabs" role="group" aria-label="Panels"><button type="button" class="btn" data-sheet="list" aria-expanded="false" aria-controls="tdList">Parts</button><button type="button" class="btn" data-sheet="card" aria-expanded="false" aria-controls="tdCard">Details</button></div>
 </div>
 <p class="colophon tdCredit"><span>Board: <a href="${SRC}" rel="noopener">ull-pocket rev 0.8 by ullnorse, CERN-OHL-P-2.0</a></span><span>A published design, drawn from its KiCad files.</span></p>`;

/* ---------- mount ---------- */
TD.mount=function(arg){
  const host=$("#td"); if(!host) return;
  TD.load().then(()=>{ if(!document.body.contains(host)) return; build(host); if(arg) open(arg,true); else card(); })
   .catch(()=>{ $("#tdList").innerHTML=`<p class="note bad">The board data didn't load. Teardown fetches data/ull-pocket.json, so serve the folder over http (python3 -m http.server) rather than opening the file directly.</p>`; });
};
/* hash forms: teardown/U7, teardown/net/+3V3, teardown/note/2 */
function open(arg,fromHash){
  const [k,v]=arg.includes("/")?[arg.slice(0,arg.indexOf("/")),decodeURIComponent(arg.slice(arg.indexOf("/")+1))]:["part",decodeURIComponent(arg)];
  if(k==="net"&&BD.netIx[v]!==undefined) selNet(BD.netIx[v],{fromHash});
  else if(k==="note"&&TD.NOTES[+v-1]) selNote(+v-1,{fromHash,zoom:true});
  else if(k==="part"&&hasPart(v)) selPart(v,{fromHash,zoom:true});
  else card();
}

let svg, stage, pins, hiG;
function build(host){
  svg=$("#tdSvg"); stage=$("#tdStage"); pins=$("#tdPins");
  const t0=performance.now(); svg.innerHTML=boardSVG(); hiG=$("#tdHi"); TD.buildMs=performance.now()-t0;
  pins.innerHTML=TD.NOTES.map((n,i)=>`<button type="button" class="tdPin" data-note="${i}" aria-label="Design note ${i+1}: ${esc(n.t)}" title="${esc(n.t)}">${i+1}</button>`).join("");
  $("#tdLayers").innerHTML=[["F.Cu","F.Cu","F"],["In1.Cu","In1","I1"],["In2.Cu","In2","I2"],["B.Cu","B.Cu","B"],["silk","Silk","S"],["zones","Zones","Z"],["refs","Refs","R"]]
    .map(([k,l,c])=>`<label class="tdTog tdTog${c}"><input type="checkbox" data-layer="${k}"${st.show[k]?" checked":""}><i aria-hidden="true"></i>${l}</label>`).join("");
  list(); applyShow(); fit(); bind(host);
}

/* ---------- part list ---------- */
function list(){
  const groups=TD.BLOCKS.map(([b,name])=>{ const refs=BD.fp.map(f=>f.ref).filter(r=>(blockOf[r]||["conn"])[0]===b).sort((a,c)=>(blockOf[a]?blockOf[a][1]:99)-(blockOf[c]?blockOf[c][1]:99));
    return `<section class="tdGrp" data-b="${b}"><h3>${esc(name)} <span class="label">${refs.length}</span></h3><ul>${refs.map(r=>{ const f=BD.ref[r];
      const key=[r,f.val,TD.title(r),f.mpn,f.desc].join(" ").toLowerCase();
      return `<li data-k="${esc(key)}"><button type="button" class="tdItem" data-ref="${r}"><span class="mono">${r}</span><span>${esc(TD.title(r))}</span></button></li>`; }).join("")}</ul></section>`; }).join("");
  $("#tdList").innerHTML=`<div class="ctrl"><label for="tdQ"><span>Find a part</span></label><input type="search" id="tdQ" placeholder="U7, LDO, 100n, SHT40…" autocomplete="off"></div>
   <section class="tdGrp tdNotesL"><h3>Design notes <span class="label">${TD.NOTES.length}</span></h3><ol>${TD.NOTES.map((n,i)=>`<li><button type="button" class="tdItem" data-note="${i}"><span class="mono">${i+1}</span><span>${esc(n.t)}</span></button></li>`).join("")}</ol></section>
   ${groups}<p class="muted tdNone" id="tdNone" hidden>No part matches that.</p>`;
  $("#tdQ").addEventListener("input",e=>{ const q=e.target.value.trim().toLowerCase(); let any=false;
    $$("#tdList .tdGrp[data-b]").forEach(g=>{ let n=0; $$("li",g).forEach(li=>{ const ok=!q||li.dataset.k.includes(q); li.hidden=!ok; n+=ok; }); g.hidden=!n; any=any||n>0; });
    $(".tdNotesL").hidden=!!q; $("#tdNone").hidden=any; });
}

/* ---------- selection ---------- */
function setHash(h){ try{ history.replaceState(null,"","#teardown"+(h?"/"+h:"")); }catch(e){} }
function selPart(r,o={}){ st.sel={k:"part",id:r}; st.refs=new Set([r]); st.nets=new Set(); paint(); card(); if(!o.fromHash) setHash(encodeURIComponent(r)); if(o.zoom) zoomTo(BD.ref[r].bb,o.fromHash); after(o); }
function selNet(n,o={}){ st.sel={k:"net",id:n}; st.refs=new Set(); st.nets=new Set([n]); paint(); card(); if(!o.fromHash) setHash("net/"+encodeURIComponent(BD.nets[n])); after(o); }
function selNote(i,o={}){ const N=TD.NOTES[i]; st.sel={k:"note",id:i}; st.refs=new Set(N.refs.filter(hasPart)); st.nets=new Set(N.nets.map(n=>BD.netIx[n]).filter(n=>n!==undefined)); paint(); card();
  if(!o.fromHash) setHash("note/"+(i+1)); if(o.zoom&&(N.fit||st.refs.size)) zoomTo(N.fit||bbOf([...st.refs]),o.fromHash); after(o); }
function clearSel(){ st.sel=null; st.refs=new Set(); st.nets=new Set(); paint(); card(); setHash(""); }
function after(o){ if(!o.fromHash) BC.beep("click"); if(o.sheet!==false&&!o.fromHash&&phone()) sheet("card"); }
/* public: highlight any set of parts and nets (for stories and the probe) */
TD.show=({refs=[],nets=[]}={})=>{ if(!BD) return; st.refs=new Set(refs.filter(hasPart)); st.nets=new Set(nets.map(n=>typeof n==="number"?n:BD.netIx[n]).filter(n=>n!==undefined)); paint(); };
const bbOf=refs=>{ const b=[1e9,1e9,-1e9,-1e9]; refs.forEach(r=>{ const q=BD.ref[r].bb; b[0]=Math.min(b[0],q[0]); b[1]=Math.min(b[1],q[1]); b[2]=Math.max(b[2],q[2]); b[3]=Math.max(b[3],q[3]); }); return b; };

/* highlight overlay: copies of the selected copper drawn on top; the base board dims */
function paint(){
  if(!hiG) return;
  const any=st.refs.size||st.nets.size;
  if(!any){ hiG.innerHTML=""; syncList(); return; }
  let h=`<path class="tdShade" d="${BD.outline.map(ringPath).join("")}" fill-rule="evenodd"/>`;
  if(st.nets.size){
    LAYERS.slice().reverse().forEach(([L,c])=>{ const z=BD.zones[L].filter(r=>st.nets.has(r[0])).map(r=>ringPath(r[1])).join("");
      const tr=BD.tracks[L].filter(t=>st.nets.has(t[5]));
      if(z||tr.length) h+=`<g class="tdHiL tdL${c}">${z?`<path class="tdHiZone" d="${z}"/>`:""}${trackPaths(tr,"tdHiTr")}</g>`; });
    const pads=[...st.nets].flatMap(n=>BD.netPads[n].map(([,p])=>padPath(p))).join("");
    const vias=BD.vias.filter(v=>st.nets.has(v[4])).map(v=>circ(v[0],v[1],v[2]/2)).join("");
    h+=`<path class="tdHiPad" d="${pads}${vias}"/>`;
  }
  st.refs.forEach(r=>{ const f=BD.ref[r], b=f.bb, pd=f.pads.map(padPath).join("");
    h+=`${pd?`<path class="tdHiPart" d="${pd}"/>`:""}<rect class="tdHiBox${/^ASSY/.test(r)?" assy":""}" x="${b[0]}" y="${b[1]}" width="${f2(b[2]-b[0])}" height="${f2(b[3]-b[1])}" vector-effect="non-scaling-stroke"/>`; });
  hiG.innerHTML=h; syncList();
}
function syncList(){
  $$("#tdList .tdItem").forEach(b=>{ const on=b.dataset.ref?st.sel&&st.sel.k==="part"&&st.sel.id===b.dataset.ref:st.sel&&st.sel.k==="note"&&st.sel.id===+b.dataset.note; b.classList.toggle("on",!!on); if(on) b.setAttribute("aria-current","true"); else b.removeAttribute("aria-current"); });
  $$("#tdPins .tdPin").forEach(b=>b.classList.toggle("on",!!(st.sel&&st.sel.k==="note"&&st.sel.id===+b.dataset.note)));
}

/* ---------- card ---------- */
const M=()=>BC.DATA.M;
function learn(ms){ if(!ms||!ms.length) return "";
  return `<h3>Learn it</h3><ul class="tdLearn">${ms.map(([n,lab])=>{ const c=M()[n-1]; if(!c) return "";
    return `<li><a href="#m-${n}">Module ${n}: ${esc(c.title)}</a>${lab&&BC.LABS[lab]?` <a class="label" href="#lab-${lab}">lab: ${esc(BC.LABS[lab].title)}</a>`:""}</li>`; }).join("")}</ul>`; }
const netBtn=(n,extra)=>`<button type="button" class="tdNet" data-net="${n}">${esc(netName(BD.nets[n]))}</button>${extra?` <span class="label">${extra}</span>`:""}`;
function autoRole(f){
  const nets=[...BD.fpNets[f.ref].keys()].map(n=>BD.nets[n]), pw=nets.filter(n=>n!=="GND");
  if(/^C/.test(f.ref)&&nets.includes("GND")&&pw.length===1){
    const n=BD.netIx[pw[0]], near=[]; BD.netPads[n].forEach(([g,p])=>{ if(/^U/.test(g.ref)){ const q=f.pads.find(x=>x[7]===n); near.push([Math.hypot(p[2]-q[2],p[3]-q[3]),g.ref,p[0]]); } });
    near.sort((a,b)=>a[0]-b[0]);
    if(near.length&&near[0][0]<4) return `${esc(f.val)} decoupling for ${near[0][1]} on ${esc(netName(pw[0]))}, ${near[0][0].toFixed(1)} mm from its pin ${esc(near[0][2])}, with the ground via close by.`;
    if(/^\/EPD_/.test(pw[0])) return `${esc(f.val)} reservoir for the panel's ${esc(netName(pw[0]))} supply, next to J3.`;
    return `${esc(f.val)} of local storage on ${esc(netName(pw[0]))}.`;
  }
  if(/^TP/.test(f.ref)) return `A bare 1 mm pad on ${esc(netName(pw[0]||"GND"))} for a probe tip. It sits under the cell, so unplug the battery to reach it.`;
  return esc((f.desc||f.val)+".");
}
function card(){
  const c=$("#tdCard"); if(!c||!BD) return;
  const s=st.sel;
  if(!s){ c.innerHTML=`<p class="label">ull-pocket · rev ${esc(BD.meta.rev)}</p><h2>The whole board</h2>
    <p>${BD.meta.w} × ${BD.meta.h} mm, four copper layers, ${BD.fp.filter(f=>!/^(ASSY|H\d)/.test(f.ref)).length} footprints. Every part is on the front; the back carries the e-paper panel and six pogo pads. It is designed to sleep most of the time on a 600 mAh LiPo; a button, motion or a timer wakes it.</p>
    <table class="spec"><tbody><tr><td>MCU</td><td>ESP32-C6</td></tr><tr><td>Sensors</td><td>SHT40, BMP580, LIS2DW12</td></tr><tr><td>Power</td><td>BQ24073, RT9080, MAX17048</td></tr><tr><td>Copper</td><td>${BD.tracks["F.Cu"].length+BD.tracks["In1.Cu"].length+BD.tracks["In2.Cu"].length+BD.tracks["B.Cu"].length} track segments, ${BD.vias.length} vias</td></tr><tr><td>Nets</td><td>${BD.nets.filter(n=>n&&!isNC(n)).length}</td></tr></tbody></table>
    <p class="muted">Pick a part from the list, click the board, or open a numbered design note.</p>`; return; }
  if(s.k==="part"){ const f=BD.ref[s.id], p=P[s.id]||{}, b=blockOf[s.id]?TD.BLOCKS.find(x=>x[0]===blockOf[s.id][0])[1]:"Connectors";
    const nets=[...BD.fpNets[s.id]].filter(([n])=>!isNC(BD.nets[n])).sort((a,b)=>BD.nets[a[0]].localeCompare(BD.nets[b[0]],undefined,{numeric:true}));
    const k=(p.k||[]).slice(), has=a=>k.some(x=>x[0]===a);
    if(f.mpn&&!has("Part")) k.push(["Part",f.mpn+(f.mfr?", "+f.mfr:"")]);
    if(f.lcsc) k.push(["LCSC",f.lcsc]);
    if(f.val&&f.val!==f.mpn&&!has("Value")&&!/^(ASSY|Mounting|PROG)/.test(f.val)) k.push(["Value",f.val]);
    c.innerHTML=`<p class="label">${esc(s.id)} · ${esc(b)}${f.side==="B"?" · back":""}</p><h2>${esc(TD.title(s.id))}</h2>
     <p>${p.d?esc(p.d):autoRole(f)}</p>
     ${k.length?`<table class="spec"><tbody>${k.map(([a,v])=>`<tr><td>${esc(a)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`:""}
     ${nets.length?`<h3>Nets</h3><ul class="tdNets">${nets.map(([n,pads])=>`<li>${netBtn(n,(pads.length>1?"pads ":"pad ")+pads.filter((x,i,a)=>a.indexOf(x)===i).join(", "))}</li>`).join("")}</ul>`:""}
     ${learn(p.m)}`;
  } else if(s.k==="net"){ const n=s.id, name=BD.nets[n], mem=new Map();
    BD.netPads[n].forEach(([f,p])=>{ if(!mem.has(f.ref)) mem.set(f.ref,[]); const a=mem.get(f.ref); if(!a.includes(p[0])) a.push(p[0]); });
    const per=LAYERS.map(([L])=>[L,BD.tracks[L].filter(t=>t[5]===n).length,BD.zones[L].some(z=>z[0]===n)]).filter(x=>x[1]||x[2]);
    const vias=BD.vias.filter(v=>v[4]===n).length;
    const refs=[...mem.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    c.innerHTML=`<p class="label">Net · ${refs.length} part${refs.length===1?"":"s"}</p><h2 class="mono tdNetH">${esc(netName(name))}</h2>
     ${NN[name]?`<p>${esc(NN[name])}</p>`:""}
     <table class="spec"><tbody>${per.map(([L,t,z])=>`<tr><td>${L}</td><td>${t?t+" segment"+(t===1?"":"s"):""}${t&&z?" + ":""}${z?"pour":""}</td></tr>`).join("")}<tr><td>Vias</td><td>${vias}</td></tr></tbody></table>
     <h3>Members</h3><ul class="tdMem">${refs.map(r=>`<li><button type="button" class="tdItem" data-ref="${r}"><span class="mono">${r}</span><span>${esc(TD.title(r))}</span></button> <span class="label">${mem.get(r).length>1?"pads":"pad"} ${esc(mem.get(r).join(", "))}</span></li>`).join("")}</ul>`;
  } else { const N=TD.NOTES[s.id];
    c.innerHTML=`<p class="label">Design note ${s.id+1} of ${TD.NOTES.length}</p><h2>${esc(N.t)}</h2><p>${esc(N.d)}</p>
     ${N.stack?stackTable():""}
     ${st.refs.size?`<h3>Parts</h3><ul class="tdMem">${[...st.refs].map(r=>`<li><button type="button" class="tdItem" data-ref="${r}"><span class="mono">${r}</span><span>${esc(TD.title(r))}</span></button></li>`).join("")}</ul>`:""}
     ${st.nets.size?`<h3>Nets</h3><ul class="tdNets">${[...st.nets].map(n=>`<li>${netBtn(n)}</li>`).join("")}</ul>`:""}
     ${learn(N.m)}
     <div class="tdStep"><button type="button" class="btn" data-step="-1"${s.id?"":" disabled"}>← Previous</button><button type="button" class="btn" data-step="1"${s.id<TD.NOTES.length-1?"":" disabled"}>Next →</button></div>`;
  }
}
function stackTable(){
  const role={"F.Cu":"parts, signals, ground pour","In1.Cu":"solid ground plane","In2.Cu":"+3V3 pour, ground","B.Cu":"signals, ground pour"};
  const rows=BD.meta.stackup.filter(l=>l[1]==="copper"||/prepreg|core/.test(l[1]));
  return `<table class="spec tdStack"><tbody>${rows.map(l=>`<tr class="${l[1]==="copper"?"cu":"die"}"><td>${l[1]==="copper"?esc(l[0]):esc(l[1])}</td><td>${l[1]==="copper"?esc(role[l[0]]||"")+", ":""}${(l[2]*1000).toFixed(l[2]<.1?1:0).replace(/\.0$/,"")} µm</td></tr>`).join("")}</tbody></table>`;
}

/* ---------- layers ---------- */
function applyShow(){
  LAYERS.forEach(([L,c])=>$$(".tdL"+c,svg).forEach(g=>g.style.display=st.show[L]?"":"none"));
  svg.classList.toggle("noZones",!st.show.zones); $(".tdSilk",svg).style.display=st.show.silk?"":"none"; $(".tdRefs",svg).style.display=st.show.refs?"":"none";
  $(".tdLthru",svg).style.display=LAYERS.some(([L])=>st.show[L])?"":"none";
}

/* ---------- pan and zoom: the view is a centre (mm) and a scale (px per mm) ---------- */
let fitS=1, raf=0;
const phone=()=>innerWidth<=760;
function size(){ return [stage.clientWidth||300, stage.clientHeight||300]; }
function fit(){ const [w,h]=size(), b=[-1,-6.4,BD.meta.w+1,BD.meta.h+1.6]; fitS=Math.min(w/(b[2]-b[0]),h/(b[3]-b[1])); st.view={cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2,s:fitS}; draw(); }
const clampS=s=>BC.clamp(s,fitS*.6,fitS*40);
function draw(){ if(raf) return; raf=requestAnimationFrame(()=>{ raf=0; const [w,h]=size(), v=st.view;
  const x=v.cx-w/2/v.s, y=v.cy-h/2/v.s; svg.setAttribute("viewBox",`${x} ${y} ${w/v.s} ${h/v.s}`);
  $$(".tdPin",pins).forEach((b,i)=>{ const n=TD.NOTES[i]; b.style.transform=`translate(${(n.x-x)*v.s}px,${(n.y-y)*v.s}px)`; });
  stage.classList.toggle("deep",v.s>fitS*3); }); }
function zoomAt(f,px,py){ const [w,h]=size(), v=st.view; px??=w/2; py??=h/2;
  const bx=v.cx+(px-w/2)/v.s, by=v.cy+(py-h/2)/v.s, s=clampS(v.s*f);
  v.cx=bx-(px-w/2)/s; v.cy=by-(py-h/2)/s; v.s=s; draw(); }
let anim=0;
function zoomTo(b,instant){ const [w,h]=size(), m=Math.max(4,(b[2]-b[0])*.6,(b[3]-b[1])*.6);
  const s=clampS(Math.min(w/(b[2]-b[0]+2*m),h/(b[3]-b[1]+2*m),fitS*2.5)), to={cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2,s};
  cancelAnimationFrame(anim);
  if(instant||BC.reduced){ Object.assign(st.view,to); draw(); return; }
  const from={...st.view}, t0=performance.now();
  const step=t=>{ const k=Math.min(1,(t-t0)/260), e=1-Math.pow(1-k,3); st.view.cx=from.cx+(to.cx-from.cx)*e; st.view.cy=from.cy+(to.cy-from.cy)*e; st.view.s=from.s*Math.pow(to.s/from.s,e); draw(); if(k<1) anim=requestAnimationFrame(step); };
  anim=requestAnimationFrame(step);
}
function toBoard(e){ const r=stage.getBoundingClientRect(), [w,h]=size(), v=st.view; return [v.cx+(e.clientX-r.left-w/2)/v.s, v.cy+(e.clientY-r.top-h/2)/v.s]; }

/* ---------- hit test, in board mm: pads, vias, tracks, part bodies, pours ---------- */
function inPad(p,x,y,tol){ const [u,v]=rot(x-p[2],y-p[3],-p[6]); let hw=p[4]/2+tol, hh=p[5]/2+tol;
  if(p[1]==="p"){ let xs=[],ys=[]; for(let i=0;i<p[9].length;i+=2){xs.push(p[9][i]);ys.push(p[9][i+1]);} return x>=Math.min(...xs)-tol&&x<=Math.max(...xs)+tol&&y>=Math.min(...ys)-tol&&y<=Math.max(...ys)+tol; }
  return Math.abs(u)<=hw&&Math.abs(v)<=hh; }
const segD=(x,y,t)=>{ const dx=t[2]-t[0], dy=t[3]-t[1], L=dx*dx+dy*dy, k=L?BC.clamp(((x-t[0])*dx+(y-t[1])*dy)/L,0,1):0; return Math.hypot(x-t[0]-k*dx,y-t[1]-k*dy); };
function inRing(r,x,y){ let c=false; for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){ const xi=r[i],yi=r[i+1],xj=r[j],yj=r[j+1]; if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; } return c; }
function hit(x,y){
  const tol=3/st.view.s, sh=st.show;
  for(const f of BD.fp){ if(/^ASSY/.test(f.ref)) continue; for(const p of f.pads) if(padOn(p,sh)&&inPad(p,x,y,tol*.5)) return {k:"pad",f,p}; }
  if(LAYERS.some(([L])=>sh[L])) for(const v of BD.vias) if(Math.hypot(x-v[0],y-v[1])<=v[2]/2+tol*.5) return {k:"net",n:v[4],what:"via"};
  for(const [L] of LAYERS) if(sh[L]) for(const t of BD.tracks[L]) if(segD(x,y,t)<=t[4]/2+tol*.6) return {k:"net",n:t[5],what:L+" track, "+t[4]+" mm"};
  let best=null; for(const f of BD.fp){ if(/^ASSY/.test(f.ref)) continue; const b=f.bb; if(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]){ const a=(b[2]-b[0])*(b[3]-b[1]); if(!best||a<best[0]) best=[a,f]; } }
  if(best) return {k:"part",f:best[1]};
  if(sh.zones) for(const [L] of LAYERS) if(sh[L]) for(const z of BD.zones[L]) if(inRing(z[1],x,y)) return {k:"net",n:z[0],what:L+" pour"};
  return null;
}
function describe(h){ if(!h) return "Drag to pan, wheel or pinch to zoom.";
  if(h.k==="pad") return `${h.f.ref} pad ${h.p[0]}${h.p[7]?" · "+netName(BD.nets[h.p[7]]):""} · ${TD.title(h.f.ref)}`;
  if(h.k==="part") return `${h.f.ref} · ${TD.title(h.f.ref)}`;
  return `${netName(BD.nets[h.n])} · ${h.what}`; }
function clickAt(x,y){ const h=hit(x,y);
  if(!h){ clearSel(); return; }
  if(h.k==="pad"){ const on=st.sel&&st.sel.k==="part"&&st.sel.id===h.f.ref; if(on&&h.p[7]) selNet(h.p[7]); else selPart(h.f.ref); }
  else if(h.k==="part") selPart(h.f.ref); else selNet(h.n); }

/* ---------- events ---------- */
function sheet(which){ const td=$("#td"); if(!td) return; st.sheet=which||null; td.dataset.sheet=which||"";
  $$(".tdTabs [data-sheet]").forEach(b=>b.setAttribute("aria-expanded",b.dataset.sheet===which)); }
function bind(host){
  host.addEventListener("click",e=>{
    const t=e.target.closest("button,input"); if(!t) return;
    if(t.dataset.ref) selPart(t.dataset.ref,{zoom:true});
    else if(t.dataset.net) selNet(+t.dataset.net);
    else if(t.dataset.note!==undefined) selNote(+t.dataset.note,{zoom:true});
    else if(t.dataset.step) selNote(st.sel.id+ +t.dataset.step,{zoom:true});
    else if(t.dataset.z){ if(t.dataset.z==="fit") fit(); else zoomAt(t.dataset.z==="in"?1.5:1/1.5); }
    else if(t.dataset.sheet) sheet(st.sheet===t.dataset.sheet?null:t.dataset.sheet);
  });
  host.addEventListener("change",e=>{ const k=e.target.dataset.layer; if(!k) return; st.show[k]=e.target.checked; applyShow(); });
  stage.addEventListener("wheel",e=>{ e.preventDefault(); const r=stage.getBoundingClientRect(); zoomAt(Math.pow(1.0015,-e.deltaY*(e.deltaMode?33:1)),e.clientX-r.left,e.clientY-r.top); },{passive:false});
  const pts=new Map(); let moved=0, pinch=null, hov=0;
  stage.addEventListener("pointerdown",e=>{ if(e.target.closest(".tdPin")) return; try{ stage.setPointerCapture(e.pointerId); }catch(_){} pts.set(e.pointerId,[e.clientX,e.clientY]); moved=0; cancelAnimationFrame(anim);
    if(pts.size===2){ const [a,b]=[...pts.values()]; pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1])}; } stage.classList.add("grab"); });
  stage.addEventListener("pointermove",e=>{
    if(!pts.has(e.pointerId)){ if(e.pointerType==="mouse"&&!hov){ hov=requestAnimationFrame(()=>{ hov=0; const [x,y]=toBoard(e); const h=hit(x,y); $("#tdHover").textContent=describe(h); stage.style.cursor=h?"pointer":""; }); } return; }
    const p=pts.get(e.pointerId), dx=e.clientX-p[0], dy=e.clientY-p[1]; pts.set(e.pointerId,[e.clientX,e.clientY]); moved+=Math.abs(dx)+Math.abs(dy);
    if(pts.size===2&&pinch){ const [a,b]=[...pts.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]), r=stage.getBoundingClientRect();
      st.view.cx-=dx/2/st.view.s; st.view.cy-=dy/2/st.view.s; zoomAt(d/pinch.d,(a[0]+b[0])/2-r.left,(a[1]+b[1])/2-r.top); pinch.d=d; }
    else if(pts.size===1){ st.view.cx-=dx/st.view.s; st.view.cy-=dy/st.view.s; draw(); } });
  const up=e=>{ if(!pts.has(e.pointerId)) return; const single=pts.size===1; pts.delete(e.pointerId); if(pts.size<2) pinch=null; if(!pts.size) stage.classList.remove("grab");
    if(single&&moved<6&&e.type==="pointerup"){ const [x,y]=toBoard(e); clickAt(x,y); } };
  stage.addEventListener("pointerup",up); stage.addEventListener("pointercancel",up);
  stage.addEventListener("pointerleave",()=>{ $("#tdHover").textContent=describe(null); });
  stage.addEventListener("keydown",e=>{ const v=st.view, step=60/v.s, k=e.key;
    if(k==="+"||k==="=") zoomAt(1.4); else if(k==="-"||k==="_") zoomAt(1/1.4); else if(k==="0") fit();
    else if(k==="ArrowLeft"){ v.cx-=step; draw(); } else if(k==="ArrowRight"){ v.cx+=step; draw(); } else if(k==="ArrowUp"){ v.cy-=step; draw(); } else if(k==="ArrowDown"){ v.cy+=step; draw(); }
    else if(k==="Escape"){ clearSel(); } else return; e.preventDefault(); });
  pins.addEventListener("pointerdown",e=>e.stopPropagation());
  host.addEventListener("keydown",e=>{ if(e.key==="Escape"&&st.sheet){ sheet(null); } });
  const ro=new ResizeObserver(()=>{ const old=fitS; const [w,h]=size(), b=[-1,-6.4,BD.meta.w+1,BD.meta.h+1.6]; fitS=Math.min(w/(b[2]-b[0]),h/(b[3]-b[1])); if(old) st.view.s*=fitS/old; draw(); });
  ro.observe(stage); BC.leave.push(()=>{ ro.disconnect(); cancelAnimationFrame(anim); cancelAnimationFrame(raf); raf=0; });
}
})();
