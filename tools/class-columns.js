/*
 * The one place the Maker x Vehicle Class column layout is written
 * down. tools/build-month-tables.js (the offline CLI path) and
 * supabase/functions/import-workbook (the online upload path) both
 * require this file rather than each keeping their own copy - two
 * copies is how a class quietly goes missing from one of the two
 * import paths and nobody notices until totals stop reconciling.
 *
 * Order matters only for the generated CREATE TABLE column order
 * and for the CSV column order the CLI path writes; the RPC that
 * actually loads a row keys everything by column name, never by
 * position, so this file being reordered cannot silently swap two
 * counts between classes the way a positional format could.
 */

const ENTITY_COLUMN = "Maker";
const TOTAL_COLUMN = "Total";

/*
 * Canonical class order: the 73 columns of the live MAKER_WISE_2026
 * table in its own order, then Bulldozer (which only MAKER_WISE_2025
 * has), then the one class the workbooks carry that neither live
 * table does. Names are the raw Vahan headers, verbatim - the
 * dashboard's CLASS_GROUPS regexes in script.js match on the spaces.
 */
const CLASS_COLUMNS = [
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
    "Motor Cycle/Scooter-With Trailer"
];

const TABLE_COLUMNS = ["year", ENTITY_COLUMN, ...CLASS_COLUMNS, TOTAL_COLUMN];

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

module.exports = {
    ENTITY_COLUMN,
    TOTAL_COLUMN,
    CLASS_COLUMNS,
    TABLE_COLUMNS,
    MONTHS
};
