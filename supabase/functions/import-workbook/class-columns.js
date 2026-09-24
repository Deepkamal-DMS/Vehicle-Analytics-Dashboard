/*
 * Generated from tools/class-columns.js by
 * supabase/functions/import-workbook/generate-class-columns.js - do not hand-edit.
 *
 * The Node CLI path (tools/build-month-tables.js) and this Deno Edge
 * Function both validate an uploaded workbook against the exact same
 * 75 class names and order, read from that one file, so an upload
 * and an offline import can never quietly diverge on what a class is
 * called or where it belongs.
 *
 * Plain ESM (no TypeScript syntax) on purpose: Deno imports it as-is,
 * and it is also run directly under Node for testing before anything
 * ships to Supabase.
 */

export const ENTITY_COLUMN = "Maker";
export const TOTAL_COLUMN = "Total";

export const CLASS_COLUMNS = [
        "Three Wheeler (Goods)",
        "Three Wheeler (Passenger)",
        "e-Rickshaw with Cart (G)",
        "e-Rickshaw(P)",
        "Tractor-Trolley(Commercial)",
        "Trailer (Agricultural)",
        "Harvester",
        "Goods Carrier",
        "M-Cycle/Scooter",
        "Trailer (Commercial)",
        "Construction Equipment Vehicle",
        "Crane Mounted Vehicle",
        "Agricultural Tractor",
        "Construction Equipment Vehicle (Commercial)",
        "Earth Moving Equipment",
        "Excavator (Commercial)",
        "Excavator (NT)",
        "Fork Lift",
        "Road Roller",
        "Tractor (Commercial)",
        "Motorised Cycle (CC  25cc)",
        "Bus",
        "Semi-Trailer (Commercial)",
        "Motor Car",
        "Vehicle Fitted With Rig",
        "Moped",
        "Armoured/Specialised Vehicle",
        "Ambulance",
        "Animal Ambulance",
        "Articulated Vehicle",
        "Auxiliary Trailer",
        "Camper Van / Trailer",
        "Camper Van / Trailer (Private Use)",
        "Dumper",
        "Educational Institution Bus",
        "Fire Fighting Vehicle",
        "Fire Tenders",
        "Hearses",
        "Maxi Cab",
        "Mobile Canteen",
        "Mobile Clinic",
        "Mobile Workshop",
        "Omni Bus",
        "Private Service Vehicle",
        "Private Service Vehicle (Individual Use)",
        "Puller Tractor",
        "Recovery Vehicle",
        "School Bus",
        "Snorked Ladders",
        "Tow Truck",
        "Tower Wagon",
        "Tree Trimming Vehicle",
        "Vehicle Fitted With Compressor",
        "Vehicle Fitted With Generator",
        "X-Ray Van",
        "Adapted Vehicle",
        "M-Cycle/Scooter-With Side Car",
        "Motor Cycle/Scooter-Used For Hire",
        "Three Wheeler (Personal)",
        "Motor Cab",
        "Motor Cycle/Scooter-SideCar(T)",
        "Quadricycle (Commercial)",
        "Quadricycle (Private)",
        "Luxury Cab",
        "Breakdown Van",
        "Cash Van",
        "Library Van",
        "Omni Bus (Private Use)",
        "Vintage Motor Vehicle",
        "Trailer For Personal Use",
        "Motor Caravan",
        "Power Tiller",
        "Modular Hydraulic Trailer",
        "Bulldozer",
        "Motor Cycle/Scooter-With Trailer",
        "Power Tiller (Commercial)"
    ];

export const KNOWN_CLASSES = new Set(CLASS_COLUMNS);

export const MONTHS = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
    ];
