DROP TABLE IF EXISTS "MAKER_WISE";

CREATE TABLE "MAKER_WISE" (
    "year"                                        smallint NOT NULL,
    "Maker"                                       text     NOT NULL,
    "Three Wheeler (Goods)"                       integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Passenger)"                   integer  NOT NULL DEFAULT 0,
    "e-Rickshaw with Cart (G)"                    integer  NOT NULL DEFAULT 0,
    "e-Rickshaw(P)"                               integer  NOT NULL DEFAULT 0,
    "Tractor-Trolley(Commercial)"                 integer  NOT NULL DEFAULT 0,
    "Trailer (Agricultural)"                      integer  NOT NULL DEFAULT 0,
    "Harvester"                                   integer  NOT NULL DEFAULT 0,
    "Goods Carrier"                               integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter"                             integer  NOT NULL DEFAULT 0,
    "Trailer (Commercial)"                        integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle"              integer  NOT NULL DEFAULT 0,
    "Crane Mounted Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Agricultural Tractor"                        integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle (Commercial)" integer  NOT NULL DEFAULT 0,
    "Earth Moving Equipment"                      integer  NOT NULL DEFAULT 0,
    "Excavator (Commercial)"                      integer  NOT NULL DEFAULT 0,
    "Excavator (NT)"                              integer  NOT NULL DEFAULT 0,
    "Fork Lift"                                   integer  NOT NULL DEFAULT 0,
    "Road Roller"                                 integer  NOT NULL DEFAULT 0,
    "Tractor (Commercial)"                        integer  NOT NULL DEFAULT 0,
    "Motorised Cycle (CC  25cc)"                  integer  NOT NULL DEFAULT 0,
    "Bus"                                         integer  NOT NULL DEFAULT 0,
    "Semi-Trailer (Commercial)"                   integer  NOT NULL DEFAULT 0,
    "Motor Car"                                   integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Rig"                     integer  NOT NULL DEFAULT 0,
    "Moped"                                       integer  NOT NULL DEFAULT 0,
    "Armoured/Specialised Vehicle"                integer  NOT NULL DEFAULT 0,
    "Ambulance"                                   integer  NOT NULL DEFAULT 0,
    "Animal Ambulance"                            integer  NOT NULL DEFAULT 0,
    "Articulated Vehicle"                         integer  NOT NULL DEFAULT 0,
    "Auxiliary Trailer"                           integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer"                        integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer (Private Use)"          integer  NOT NULL DEFAULT 0,
    "Dumper"                                      integer  NOT NULL DEFAULT 0,
    "Educational Institution Bus"                 integer  NOT NULL DEFAULT 0,
    "Fire Fighting Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Fire Tenders"                                integer  NOT NULL DEFAULT 0,
    "Hearses"                                     integer  NOT NULL DEFAULT 0,
    "Maxi Cab"                                    integer  NOT NULL DEFAULT 0,
    "Mobile Canteen"                              integer  NOT NULL DEFAULT 0,
    "Mobile Clinic"                               integer  NOT NULL DEFAULT 0,
    "Mobile Workshop"                             integer  NOT NULL DEFAULT 0,
    "Omni Bus"                                    integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle"                     integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle (Individual Use)"    integer  NOT NULL DEFAULT 0,
    "Puller Tractor"                              integer  NOT NULL DEFAULT 0,
    "Recovery Vehicle"                            integer  NOT NULL DEFAULT 0,
    "School Bus"                                  integer  NOT NULL DEFAULT 0,
    "Snorked Ladders"                             integer  NOT NULL DEFAULT 0,
    "Tow Truck"                                   integer  NOT NULL DEFAULT 0,
    "Tower Wagon"                                 integer  NOT NULL DEFAULT 0,
    "Tree Trimming Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Compressor"              integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Generator"               integer  NOT NULL DEFAULT 0,
    "X-Ray Van"                                   integer  NOT NULL DEFAULT 0,
    "Adapted Vehicle"                             integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter-With Side Car"               integer  NOT NULL DEFAULT 0,
    "Motor Cycle/Scooter-Used For Hire"           integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Personal)"                    integer  NOT NULL DEFAULT 0,
    "Motor Cab"                                   integer  NOT NULL DEFAULT 0,
    "Motor Cycle/Scooter-SideCar(T)"              integer  NOT NULL DEFAULT 0,
    "Quadricycle (Commercial)"                    integer  NOT NULL DEFAULT 0,
    "Quadricycle (Private)"                       integer  NOT NULL DEFAULT 0,
    "Luxury Cab"                                  integer  NOT NULL DEFAULT 0,
    "Breakdown Van"                               integer  NOT NULL DEFAULT 0,
    "Cash Van"                                    integer  NOT NULL DEFAULT 0,
    "Library Van"                                 integer  NOT NULL DEFAULT 0,
    "Omni Bus (Private Use)"                      integer  NOT NULL DEFAULT 0,
    "Vintage Motor Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Trailer For Personal Use"                    integer  NOT NULL DEFAULT 0,
    "Motor Caravan"                               integer  NOT NULL DEFAULT 0,
    "Power Tiller"                                integer  NOT NULL DEFAULT 0,
    "Modular Hydraulic Trailer"                   integer  NOT NULL DEFAULT 0,
    "Bulldozer"                                   integer  NOT NULL DEFAULT 0,
    "Total"                                       integer  NOT NULL DEFAULT 0,
    PRIMARY KEY ("year", "Maker"),
    CHECK ("year" BETWEEN 2000 AND 2100)
);

INSERT INTO "MAKER_WISE" ("year", "Maker", "Three Wheeler (Goods)", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Tractor-Trolley(Commercial)", "Trailer (Agricultural)", "Harvester", "Goods Carrier", "M-Cycle/Scooter", "Trailer (Commercial)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Construction Equipment Vehicle (Commercial)", "Earth Moving Equipment", "Excavator (Commercial)", "Excavator (NT)", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Motorised Cycle (CC  25cc)", "Bus", "Semi-Trailer (Commercial)", "Motor Car", "Vehicle Fitted With Rig", "Moped", "Armoured/Specialised Vehicle", "Ambulance", "Animal Ambulance", "Articulated Vehicle", "Auxiliary Trailer", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Hearses", "Maxi Cab", "Mobile Canteen", "Mobile Clinic", "Mobile Workshop", "Omni Bus", "Private Service Vehicle", "Private Service Vehicle (Individual Use)", "Puller Tractor", "Recovery Vehicle", "School Bus", "Snorked Ladders", "Tow Truck", "Tower Wagon", "Tree Trimming Vehicle", "Vehicle Fitted With Compressor", "Vehicle Fitted With Generator", "X-Ray Van", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Three Wheeler (Personal)", "Motor Cab", "Motor Cycle/Scooter-SideCar(T)", "Quadricycle (Commercial)", "Quadricycle (Private)", "Luxury Cab", "Breakdown Van", "Cash Van", "Library Van", "Omni Bus (Private Use)", "Vintage Motor Vehicle", "Trailer For Personal Use", "Motor Caravan", "Power Tiller", "Modular Hydraulic Trailer", "Bulldozer", "Total")
SELECT 2025, "Maker", "Three Wheeler (Goods)", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Tractor-Trolley(Commercial)", "Trailer (Agricultural)", "Harvester", "Goods Carrier", "M-Cycle/Scooter", "Trailer (Commercial)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Construction Equipment Vehicle (Commercial)", "Earth Moving Equipment", "Excavator (Commercial)", "Excavator (NT)", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Motorised Cycle (CC  25cc)", "Bus", "Semi-Trailer (Commercial)", "Motor Car", "Vehicle Fitted With Rig", "Moped", "Armoured/Specialised Vehicle", "Ambulance", "Animal Ambulance", "Articulated Vehicle", "Auxiliary Trailer", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Hearses", "Maxi Cab", "Mobile Canteen", "Mobile Clinic", "Mobile Workshop", "Omni Bus", "Private Service Vehicle", "Private Service Vehicle (Individual Use)", "Puller Tractor", "Recovery Vehicle", "School Bus", "Snorked Ladders", "Tow Truck", "Tower Wagon", "Tree Trimming Vehicle", "Vehicle Fitted With Compressor", "Vehicle Fitted With Generator", "X-Ray Van", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Three Wheeler (Personal)", "Motor Cab", "Motor Cycle/Scooter-SideCar(T)", "Quadricycle (Commercial)", "Quadricycle (Private)", "Luxury Cab", "Breakdown Van", "Cash Van", "Library Van", "Omni Bus (Private Use)", "Vintage Motor Vehicle", "Trailer For Personal Use", "Motor Caravan", 0, 0, "Bulldozer", "Total"
FROM "MAKER_WISE_2025";

INSERT INTO "MAKER_WISE" ("year", "Maker", "Three Wheeler (Goods)", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Tractor-Trolley(Commercial)", "Trailer (Agricultural)", "Harvester", "Goods Carrier", "M-Cycle/Scooter", "Trailer (Commercial)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Construction Equipment Vehicle (Commercial)", "Earth Moving Equipment", "Excavator (Commercial)", "Excavator (NT)", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Motorised Cycle (CC  25cc)", "Bus", "Semi-Trailer (Commercial)", "Motor Car", "Vehicle Fitted With Rig", "Moped", "Armoured/Specialised Vehicle", "Ambulance", "Animal Ambulance", "Articulated Vehicle", "Auxiliary Trailer", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Hearses", "Maxi Cab", "Mobile Canteen", "Mobile Clinic", "Mobile Workshop", "Omni Bus", "Private Service Vehicle", "Private Service Vehicle (Individual Use)", "Puller Tractor", "Recovery Vehicle", "School Bus", "Snorked Ladders", "Tow Truck", "Tower Wagon", "Tree Trimming Vehicle", "Vehicle Fitted With Compressor", "Vehicle Fitted With Generator", "X-Ray Van", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Three Wheeler (Personal)", "Motor Cab", "Motor Cycle/Scooter-SideCar(T)", "Quadricycle (Commercial)", "Quadricycle (Private)", "Luxury Cab", "Breakdown Van", "Cash Van", "Library Van", "Omni Bus (Private Use)", "Vintage Motor Vehicle", "Trailer For Personal Use", "Motor Caravan", "Power Tiller", "Modular Hydraulic Trailer", "Bulldozer", "Total")
SELECT 2026, "Maker", "Three Wheeler (Goods)", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Tractor-Trolley(Commercial)", "Trailer (Agricultural)", "Harvester", "Goods Carrier", "M-Cycle/Scooter", "Trailer (Commercial)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Construction Equipment Vehicle (Commercial)", "Earth Moving Equipment", "Excavator (Commercial)", "Excavator (NT)", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Motorised Cycle (CC  25cc)", "Bus", "Semi-Trailer (Commercial)", "Motor Car", "Vehicle Fitted With Rig", "Moped", "Armoured/Specialised Vehicle", "Ambulance", "Animal Ambulance", "Articulated Vehicle", "Auxiliary Trailer", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Hearses", "Maxi Cab", "Mobile Canteen", "Mobile Clinic", "Mobile Workshop", "Omni Bus", "Private Service Vehicle", "Private Service Vehicle (Individual Use)", "Puller Tractor", "Recovery Vehicle", "School Bus", "Snorked Ladders", "Tow Truck", "Tower Wagon", "Tree Trimming Vehicle", "Vehicle Fitted With Compressor", "Vehicle Fitted With Generator", "X-Ray Van", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Three Wheeler (Personal)", "Motor Cab", "Motor Cycle/Scooter-SideCar(T)", "Quadricycle (Commercial)", "Quadricycle (Private)", "Luxury Cab", "Breakdown Van", "Cash Van", "Library Van", "Omni Bus (Private Use)", "Vintage Motor Vehicle", "Trailer For Personal Use", "Motor Caravan", "Power Tiller", "Modular Hydraulic Trailer", 0, "Total"
FROM "MAKER_WISE_2026";

ALTER TABLE "MAKER_WISE" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "MAKER_WISE" TO anon, authenticated;

DROP POLICY IF EXISTS "anon read MAKER_WISE" ON "MAKER_WISE";

CREATE POLICY "anon read MAKER_WISE" ON "MAKER_WISE"
    FOR SELECT TO anon, authenticated USING (true);

DROP TABLE IF EXISTS "Gujarat_Class_Wise";

CREATE TABLE "Gujarat_Class_Wise" (
    "year"                                        smallint NOT NULL,
    "Maker"                                       text     NOT NULL,
    "Three Wheeler (Goods)"                       integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter"                             integer  NOT NULL DEFAULT 0,
    "Agricultural Tractor"                        integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle"              integer  NOT NULL DEFAULT 0,
    "Crane Mounted Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Earth Moving Equipment"                      integer  NOT NULL DEFAULT 0,
    "Fork Lift"                                   integer  NOT NULL DEFAULT 0,
    "Road Roller"                                 integer  NOT NULL DEFAULT 0,
    "Tractor (Commercial)"                        integer  NOT NULL DEFAULT 0,
    "Trailer (Agricultural)"                      integer  NOT NULL DEFAULT 0,
    "Bus"                                         integer  NOT NULL DEFAULT 0,
    "e-Rickshaw with Cart (G)"                    integer  NOT NULL DEFAULT 0,
    "e-Rickshaw(P)"                               integer  NOT NULL DEFAULT 0,
    "Excavator (NT)"                              integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Rig"                     integer  NOT NULL DEFAULT 0,
    "Animal Ambulance"                            integer  NOT NULL DEFAULT 0,
    "Articulated Vehicle"                         integer  NOT NULL DEFAULT 0,
    "Dumper"                                      integer  NOT NULL DEFAULT 0,
    "Educational Institution Bus"                 integer  NOT NULL DEFAULT 0,
    "Fire Fighting Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Fire Tenders"                                integer  NOT NULL DEFAULT 0,
    "Goods Carrier"                               integer  NOT NULL DEFAULT 0,
    "Hearses"                                     integer  NOT NULL DEFAULT 0,
    "Mobile Clinic"                               integer  NOT NULL DEFAULT 0,
    "Omni Bus"                                    integer  NOT NULL DEFAULT 0,
    "Recovery Vehicle"                            integer  NOT NULL DEFAULT 0,
    "Tower Wagon"                                 integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Compressor"              integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Passenger)"                   integer  NOT NULL DEFAULT 0,
    "Adapted Vehicle"                             integer  NOT NULL DEFAULT 0,
    "Moped"                                       integer  NOT NULL DEFAULT 0,
    "Motorised Cycle (CC  25cc)"                  integer  NOT NULL DEFAULT 0,
    "Motor Car"                                   integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter-With Side Car"               integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Personal)"                    integer  NOT NULL DEFAULT 0,
    "Motor Cab"                                   integer  NOT NULL DEFAULT 0,
    "Harvester"                                   integer  NOT NULL DEFAULT 0,
    "Ambulance"                                   integer  NOT NULL DEFAULT 0,
    "Armoured/Specialised Vehicle"                integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer"                        integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer (Private Use)"          integer  NOT NULL DEFAULT 0,
    "Maxi Cab"                                    integer  NOT NULL DEFAULT 0,
    "Omni Bus (Private Use)"                      integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle (Individual Use)"    integer  NOT NULL DEFAULT 0,
    "Motor Cycle/Scooter-Used For Hire"           integer  NOT NULL DEFAULT 0,
    "Trailer (Commercial)"                        integer  NOT NULL DEFAULT 0,
    "Cash Van"                                    integer  NOT NULL DEFAULT 0,
    "Semi-Trailer (Commercial)"                   integer  NOT NULL DEFAULT 0,
    "Library Van"                                 integer  NOT NULL DEFAULT 0,
    "Tow Truck"                                   integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle"                     integer  NOT NULL DEFAULT 0,
    "Auxiliary Trailer"                           integer  NOT NULL DEFAULT 0,
    "Breakdown Van"                               integer  NOT NULL DEFAULT 0,
    "Snorked Ladders"                             integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Generator"               integer  NOT NULL DEFAULT 0,
    "Mobile Workshop"                             integer  NOT NULL DEFAULT 0,
    "X-Ray Van"                                   integer  NOT NULL DEFAULT 0,
    "Quadricycle (Private)"                       integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle (Commercial)" integer  NOT NULL DEFAULT 0,
    "Tractor-Trolley(Commercial)"                 integer  NOT NULL DEFAULT 0,
    "Vintage Motor Vehicle"                       integer  NOT NULL DEFAULT 0,
    "Total"                                       integer  NOT NULL DEFAULT 0,
    PRIMARY KEY ("year", "Maker"),
    CHECK ("year" BETWEEN 2000 AND 2100)
);

INSERT INTO "Gujarat_Class_Wise" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Agricultural Tractor", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Trailer (Agricultural)", "Bus", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Excavator (NT)", "Vehicle Fitted With Rig", "Animal Ambulance", "Articulated Vehicle", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Goods Carrier", "Hearses", "Mobile Clinic", "Omni Bus", "Recovery Vehicle", "Tower Wagon", "Vehicle Fitted With Compressor", "Three Wheeler (Passenger)", "Adapted Vehicle", "Moped", "Motorised Cycle (CC  25cc)", "Motor Car", "M-Cycle/Scooter-With Side Car", "Three Wheeler (Personal)", "Motor Cab", "Harvester", "Ambulance", "Armoured/Specialised Vehicle", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Omni Bus (Private Use)", "Private Service Vehicle (Individual Use)", "Motor Cycle/Scooter-Used For Hire", "Trailer (Commercial)", "Cash Van", "Semi-Trailer (Commercial)", "Library Van", "Tow Truck", "Private Service Vehicle", "Auxiliary Trailer", "Breakdown Van", "Snorked Ladders", "Vehicle Fitted With Generator", "Mobile Workshop", "X-Ray Van", "Quadricycle (Private)", "Construction Equipment Vehicle (Commercial)", "Tractor-Trolley(Commercial)", "Vintage Motor Vehicle", "Total")
SELECT 2025, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Agricultural Tractor", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Trailer (Agricultural)", "Bus", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Excavator (NT)", "Vehicle Fitted With Rig", "Animal Ambulance", "Articulated Vehicle", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Goods Carrier", "Hearses", "Mobile Clinic", "Omni Bus", "Recovery Vehicle", "Tower Wagon", "Vehicle Fitted With Compressor", "Three Wheeler (Passenger)", "Adapted Vehicle", "Moped", "Motorised Cycle (CC  25cc)", "Motor Car", "M-Cycle/Scooter-With Side Car", "Three Wheeler (Personal)", "Motor Cab", "Harvester", "Ambulance", "Armoured/Specialised Vehicle", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Omni Bus (Private Use)", "Private Service Vehicle (Individual Use)", "Motor Cycle/Scooter-Used For Hire", "Trailer (Commercial)", "Cash Van", "Semi-Trailer (Commercial)", "Library Van", 0, 0, "Auxiliary Trailer", "Breakdown Van", "Snorked Ladders", "Vehicle Fitted With Generator", "Mobile Workshop", "X-Ray Van", "Quadricycle (Private)", "Construction Equipment Vehicle (Commercial)", "Tractor-Trolley(Commercial)", "Vintage Motor Vehicle", "Total"
FROM "Gujarat_Class_Wise_2025";

INSERT INTO "Gujarat_Class_Wise" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Agricultural Tractor", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Trailer (Agricultural)", "Bus", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Excavator (NT)", "Vehicle Fitted With Rig", "Animal Ambulance", "Articulated Vehicle", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Goods Carrier", "Hearses", "Mobile Clinic", "Omni Bus", "Recovery Vehicle", "Tower Wagon", "Vehicle Fitted With Compressor", "Three Wheeler (Passenger)", "Adapted Vehicle", "Moped", "Motorised Cycle (CC  25cc)", "Motor Car", "M-Cycle/Scooter-With Side Car", "Three Wheeler (Personal)", "Motor Cab", "Harvester", "Ambulance", "Armoured/Specialised Vehicle", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Omni Bus (Private Use)", "Private Service Vehicle (Individual Use)", "Motor Cycle/Scooter-Used For Hire", "Trailer (Commercial)", "Cash Van", "Semi-Trailer (Commercial)", "Library Van", "Tow Truck", "Private Service Vehicle", "Auxiliary Trailer", "Breakdown Van", "Snorked Ladders", "Vehicle Fitted With Generator", "Mobile Workshop", "X-Ray Van", "Quadricycle (Private)", "Construction Equipment Vehicle (Commercial)", "Tractor-Trolley(Commercial)", "Vintage Motor Vehicle", "Total")
SELECT 2026, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Agricultural Tractor", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Fork Lift", "Road Roller", "Tractor (Commercial)", "Trailer (Agricultural)", "Bus", "e-Rickshaw with Cart (G)", "e-Rickshaw(P)", "Excavator (NT)", "Vehicle Fitted With Rig", "Animal Ambulance", "Articulated Vehicle", "Dumper", "Educational Institution Bus", "Fire Fighting Vehicle", "Fire Tenders", "Goods Carrier", "Hearses", "Mobile Clinic", "Omni Bus", "Recovery Vehicle", "Tower Wagon", "Vehicle Fitted With Compressor", "Three Wheeler (Passenger)", "Adapted Vehicle", "Moped", "Motorised Cycle (CC  25cc)", "Motor Car", "M-Cycle/Scooter-With Side Car", "Three Wheeler (Personal)", "Motor Cab", "Harvester", "Ambulance", "Armoured/Specialised Vehicle", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Omni Bus (Private Use)", "Private Service Vehicle (Individual Use)", "Motor Cycle/Scooter-Used For Hire", "Trailer (Commercial)", "Cash Van", "Semi-Trailer (Commercial)", "Library Van", "Tow Truck", "Private Service Vehicle", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "Total"
FROM "Gujarat_Class_Wise_2026";

ALTER TABLE "Gujarat_Class_Wise" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "Gujarat_Class_Wise" TO anon, authenticated;

DROP POLICY IF EXISTS "anon read Gujarat_Class_Wise" ON "Gujarat_Class_Wise";

CREATE POLICY "anon read Gujarat_Class_Wise" ON "Gujarat_Class_Wise"
    FOR SELECT TO anon, authenticated USING (true);

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ01";

CREATE TABLE "Maker_Class_Wise_GJ01" (
    "year"                                     smallint NOT NULL,
    "Maker"                                    text     NOT NULL,
    "Three Wheeler (Goods)"                    integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter"                          integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle"           integer  NOT NULL DEFAULT 0,
    "Crane Mounted Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Earth Moving Equipment"                   integer  NOT NULL DEFAULT 0,
    "Bus"                                      integer  NOT NULL DEFAULT 0,
    "Goods Carrier"                            integer  NOT NULL DEFAULT 0,
    "Mobile Clinic"                            integer  NOT NULL DEFAULT 0,
    "Moped"                                    integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Passenger)"                integer  NOT NULL DEFAULT 0,
    "e-Rickshaw with Cart (G)"                 integer  NOT NULL DEFAULT 0,
    "Motor Car"                                integer  NOT NULL DEFAULT 0,
    "Trailer (Agricultural)"                   integer  NOT NULL DEFAULT 0,
    "Motor Cab"                                integer  NOT NULL DEFAULT 0,
    "Agricultural Tractor"                     integer  NOT NULL DEFAULT 0,
    "Tractor (Commercial)"                     integer  NOT NULL DEFAULT 0,
    "e-Rickshaw(P)"                            integer  NOT NULL DEFAULT 0,
    "Ambulance"                                integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer"                     integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer (Private Use)"       integer  NOT NULL DEFAULT 0,
    "Maxi Cab"                                 integer  NOT NULL DEFAULT 0,
    "Adapted Vehicle"                          integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter-With Side Car"            integer  NOT NULL DEFAULT 0,
    "Motor Cycle/Scooter-Used For Hire"        integer  NOT NULL DEFAULT 0,
    "Excavator (NT)"                           integer  NOT NULL DEFAULT 0,
    "Fork Lift"                                integer  NOT NULL DEFAULT 0,
    "Cash Van"                                 integer  NOT NULL DEFAULT 0,
    "Fire Fighting Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Motorised Cycle (CC  25cc)"               integer  NOT NULL DEFAULT 0,
    "Trailer (Commercial)"                     integer  NOT NULL DEFAULT 0,
    "Articulated Vehicle"                      integer  NOT NULL DEFAULT 0,
    "Recovery Vehicle"                         integer  NOT NULL DEFAULT 0,
    "Omni Bus (Private Use)"                   integer  NOT NULL DEFAULT 0,
    "Fire Tenders"                             integer  NOT NULL DEFAULT 0,
    "Tower Wagon"                              integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Generator"            integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Personal)"                 integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle (Individual Use)" integer  NOT NULL DEFAULT 0,
    "Quadricycle (Private)"                    integer  NOT NULL DEFAULT 0,
    "Dumper"                                   integer  NOT NULL DEFAULT 0,
    "Armoured/Specialised Vehicle"             integer  NOT NULL DEFAULT 0,
    "Mobile Workshop"                          integer  NOT NULL DEFAULT 0,
    "Omni Bus"                                 integer  NOT NULL DEFAULT 0,
    "Total"                                    integer  NOT NULL DEFAULT 0,
    PRIMARY KEY ("year", "Maker"),
    CHECK ("year" BETWEEN 2000 AND 2100)
);

INSERT INTO "Maker_Class_Wise_GJ01" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Bus", "Goods Carrier", "Mobile Clinic", "Moped", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Trailer (Agricultural)", "Motor Cab", "Agricultural Tractor", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Fork Lift", "Cash Van", "Fire Fighting Vehicle", "Motorised Cycle (CC  25cc)", "Trailer (Commercial)", "Articulated Vehicle", "Recovery Vehicle", "Omni Bus (Private Use)", "Fire Tenders", "Tower Wagon", "Vehicle Fitted With Generator", "Three Wheeler (Personal)", "Private Service Vehicle (Individual Use)", "Quadricycle (Private)", "Dumper", "Armoured/Specialised Vehicle", "Mobile Workshop", "Omni Bus", "Total")
SELECT 2025, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Bus", "Goods Carrier", "Mobile Clinic", "Moped", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Trailer (Agricultural)", "Motor Cab", "Agricultural Tractor", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", 0, "Camper Van / Trailer (Private Use)", "Maxi Cab", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Fork Lift", "Cash Van", 0, "Motorised Cycle (CC  25cc)", 0, 0, "Recovery Vehicle", "Omni Bus (Private Use)", "Fire Tenders", "Tower Wagon", "Vehicle Fitted With Generator", "Three Wheeler (Personal)", "Private Service Vehicle (Individual Use)", "Quadricycle (Private)", "Dumper", "Armoured/Specialised Vehicle", "Mobile Workshop", "Omni Bus", "Total"
FROM "Maker_Class_Wise_GJ01_2025";

INSERT INTO "Maker_Class_Wise_GJ01" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Bus", "Goods Carrier", "Mobile Clinic", "Moped", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Trailer (Agricultural)", "Motor Cab", "Agricultural Tractor", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Fork Lift", "Cash Van", "Fire Fighting Vehicle", "Motorised Cycle (CC  25cc)", "Trailer (Commercial)", "Articulated Vehicle", "Recovery Vehicle", "Omni Bus (Private Use)", "Fire Tenders", "Tower Wagon", "Vehicle Fitted With Generator", "Three Wheeler (Personal)", "Private Service Vehicle (Individual Use)", "Quadricycle (Private)", "Dumper", "Armoured/Specialised Vehicle", "Mobile Workshop", "Omni Bus", "Total")
SELECT 2026, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Earth Moving Equipment", "Bus", "Goods Carrier", "Mobile Clinic", "Moped", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Trailer (Agricultural)", "Motor Cab", "Agricultural Tractor", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Camper Van / Trailer", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Fork Lift", "Cash Van", "Fire Fighting Vehicle", "Motorised Cycle (CC  25cc)", "Trailer (Commercial)", "Articulated Vehicle", "Recovery Vehicle", "Omni Bus (Private Use)", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "Total"
FROM "Maker_Class_Wise_GJ01_2026";

ALTER TABLE "Maker_Class_Wise_GJ01" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "Maker_Class_Wise_GJ01" TO anon, authenticated;

DROP POLICY IF EXISTS "anon read Maker_Class_Wise_GJ01" ON "Maker_Class_Wise_GJ01";

CREATE POLICY "anon read Maker_Class_Wise_GJ01" ON "Maker_Class_Wise_GJ01"
    FOR SELECT TO anon, authenticated USING (true);

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ13";

CREATE TABLE "Maker_Class_Wise_GJ13" (
    "year"                                     smallint NOT NULL,
    "Maker"                                    text     NOT NULL,
    "Three Wheeler (Goods)"                    integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle"           integer  NOT NULL DEFAULT 0,
    "Crane Mounted Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Road Roller"                              integer  NOT NULL DEFAULT 0,
    "Agricultural Tractor"                     integer  NOT NULL DEFAULT 0,
    "Fork Lift"                                integer  NOT NULL DEFAULT 0,
    "Trailer (Agricultural)"                   integer  NOT NULL DEFAULT 0,
    "Bus"                                      integer  NOT NULL DEFAULT 0,
    "Fire Tenders"                             integer  NOT NULL DEFAULT 0,
    "Goods Carrier"                            integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter"                          integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Passenger)"                integer  NOT NULL DEFAULT 0,
    "e-Rickshaw with Cart (G)"                 integer  NOT NULL DEFAULT 0,
    "Moped"                                    integer  NOT NULL DEFAULT 0,
    "Motor Car"                                integer  NOT NULL DEFAULT 0,
    "Tractor (Commercial)"                     integer  NOT NULL DEFAULT 0,
    "e-Rickshaw(P)"                            integer  NOT NULL DEFAULT 0,
    "Ambulance"                                integer  NOT NULL DEFAULT 0,
    "Maxi Cab"                                 integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle (Individual Use)" integer  NOT NULL DEFAULT 0,
    "Adapted Vehicle"                          integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter-With Side Car"            integer  NOT NULL DEFAULT 0,
    "Motorised Cycle (CC  25cc)"               integer  NOT NULL DEFAULT 0,
    "Motor Cab"                                integer  NOT NULL DEFAULT 0,
    "Animal Ambulance"                         integer  NOT NULL DEFAULT 0,
    "Dumper"                                   integer  NOT NULL DEFAULT 0,
    "Harvester"                                integer  NOT NULL DEFAULT 0,
    "Educational Institution Bus"              integer  NOT NULL DEFAULT 0,
    "Fire Fighting Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Personal)"                 integer  NOT NULL DEFAULT 0,
    "Tower Wagon"                              integer  NOT NULL DEFAULT 0,
    "Earth Moving Equipment"                   integer  NOT NULL DEFAULT 0,
    "Total"                                    integer  NOT NULL DEFAULT 0,
    PRIMARY KEY ("year", "Maker"),
    CHECK ("year" BETWEEN 2000 AND 2100)
);

INSERT INTO "Maker_Class_Wise_GJ13" ("year", "Maker", "Three Wheeler (Goods)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Road Roller", "Agricultural Tractor", "Fork Lift", "Trailer (Agricultural)", "Bus", "Fire Tenders", "Goods Carrier", "M-Cycle/Scooter", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Moped", "Motor Car", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Maxi Cab", "Private Service Vehicle (Individual Use)", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motorised Cycle (CC  25cc)", "Motor Cab", "Animal Ambulance", "Dumper", "Harvester", "Educational Institution Bus", "Fire Fighting Vehicle", "Three Wheeler (Personal)", "Tower Wagon", "Earth Moving Equipment", "Total")
SELECT 2025, "Maker", "Three Wheeler (Goods)", "Construction Equipment Vehicle", 0, 0, "Agricultural Tractor", "Fork Lift", "Trailer (Agricultural)", "Bus", 0, "Goods Carrier", "M-Cycle/Scooter", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Moped", "Motor Car", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Maxi Cab", "Private Service Vehicle (Individual Use)", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motorised Cycle (CC  25cc)", "Motor Cab", "Animal Ambulance", "Dumper", "Harvester", 0, "Fire Fighting Vehicle", "Three Wheeler (Personal)", "Tower Wagon", "Earth Moving Equipment", "Total"
FROM "Maker_Class_Wise_GJ13_2025";

INSERT INTO "Maker_Class_Wise_GJ13" ("year", "Maker", "Three Wheeler (Goods)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Road Roller", "Agricultural Tractor", "Fork Lift", "Trailer (Agricultural)", "Bus", "Fire Tenders", "Goods Carrier", "M-Cycle/Scooter", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Moped", "Motor Car", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Maxi Cab", "Private Service Vehicle (Individual Use)", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motorised Cycle (CC  25cc)", "Motor Cab", "Animal Ambulance", "Dumper", "Harvester", "Educational Institution Bus", "Fire Fighting Vehicle", "Three Wheeler (Personal)", "Tower Wagon", "Earth Moving Equipment", "Total")
SELECT 2026, "Maker", "Three Wheeler (Goods)", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Road Roller", "Agricultural Tractor", "Fork Lift", "Trailer (Agricultural)", "Bus", "Fire Tenders", "Goods Carrier", "M-Cycle/Scooter", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Moped", "Motor Car", "Tractor (Commercial)", "e-Rickshaw(P)", "Ambulance", "Maxi Cab", "Private Service Vehicle (Individual Use)", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motorised Cycle (CC  25cc)", "Motor Cab", "Animal Ambulance", "Dumper", "Harvester", "Educational Institution Bus", "Fire Fighting Vehicle", 0, 0, 0, "Total"
FROM "Maker_Class_Wise_GJ13_2026";

ALTER TABLE "Maker_Class_Wise_GJ13" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "Maker_Class_Wise_GJ13" TO anon, authenticated;

DROP POLICY IF EXISTS "anon read Maker_Class_Wise_GJ13" ON "Maker_Class_Wise_GJ13";

CREATE POLICY "anon read Maker_Class_Wise_GJ13" ON "Maker_Class_Wise_GJ13"
    FOR SELECT TO anon, authenticated USING (true);

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ27";

CREATE TABLE "Maker_Class_Wise_GJ27" (
    "year"                                     smallint NOT NULL,
    "Maker"                                    text     NOT NULL,
    "Three Wheeler (Goods)"                    integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter"                          integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle"           integer  NOT NULL DEFAULT 0,
    "Crane Mounted Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Fork Lift"                                integer  NOT NULL DEFAULT 0,
    "Agricultural Tractor"                     integer  NOT NULL DEFAULT 0,
    "Bus"                                      integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Rig"                  integer  NOT NULL DEFAULT 0,
    "Articulated Vehicle"                      integer  NOT NULL DEFAULT 0,
    "Goods Carrier"                            integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Passenger)"                integer  NOT NULL DEFAULT 0,
    "e-Rickshaw with Cart (G)"                 integer  NOT NULL DEFAULT 0,
    "Motor Car"                                integer  NOT NULL DEFAULT 0,
    "Moped"                                    integer  NOT NULL DEFAULT 0,
    "Motorised Cycle (CC  25cc)"               integer  NOT NULL DEFAULT 0,
    "Tractor (Commercial)"                     integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer (Private Use)"       integer  NOT NULL DEFAULT 0,
    "Maxi Cab"                                 integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle (Individual Use)" integer  NOT NULL DEFAULT 0,
    "e-Rickshaw(P)"                            integer  NOT NULL DEFAULT 0,
    "Harvester"                                integer  NOT NULL DEFAULT 0,
    "Adapted Vehicle"                          integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter-With Side Car"            integer  NOT NULL DEFAULT 0,
    "Motor Cab"                                integer  NOT NULL DEFAULT 0,
    "Ambulance"                                integer  NOT NULL DEFAULT 0,
    "Recovery Vehicle"                         integer  NOT NULL DEFAULT 0,
    "Trailer (Agricultural)"                   integer  NOT NULL DEFAULT 0,
    "Dumper"                                   integer  NOT NULL DEFAULT 0,
    "Trailer (Commercial)"                     integer  NOT NULL DEFAULT 0,
    "Fire Fighting Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Earth Moving Equipment"                   integer  NOT NULL DEFAULT 0,
    "Vehicle Fitted With Generator"            integer  NOT NULL DEFAULT 0,
    "Camper Van / Trailer"                     integer  NOT NULL DEFAULT 0,
    "Motor Cycle/Scooter-Used For Hire"        integer  NOT NULL DEFAULT 0,
    "Excavator (NT)"                           integer  NOT NULL DEFAULT 0,
    "Animal Ambulance"                         integer  NOT NULL DEFAULT 0,
    "Semi-Trailer (Commercial)"                integer  NOT NULL DEFAULT 0,
    "Tower Wagon"                              integer  NOT NULL DEFAULT 0,
    "Total"                                    integer  NOT NULL DEFAULT 0,
    PRIMARY KEY ("year", "Maker"),
    CHECK ("year" BETWEEN 2000 AND 2100)
);

INSERT INTO "Maker_Class_Wise_GJ27" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Fork Lift", "Agricultural Tractor", "Bus", "Vehicle Fitted With Rig", "Articulated Vehicle", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Moped", "Motorised Cycle (CC  25cc)", "Tractor (Commercial)", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Private Service Vehicle (Individual Use)", "e-Rickshaw(P)", "Harvester", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cab", "Ambulance", "Recovery Vehicle", "Trailer (Agricultural)", "Dumper", "Trailer (Commercial)", "Fire Fighting Vehicle", "Earth Moving Equipment", "Vehicle Fitted With Generator", "Camper Van / Trailer", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Animal Ambulance", "Semi-Trailer (Commercial)", "Tower Wagon", "Total")
SELECT 2025, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Fork Lift", "Agricultural Tractor", "Bus", "Vehicle Fitted With Rig", "Articulated Vehicle", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Moped", "Motorised Cycle (CC  25cc)", "Tractor (Commercial)", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Private Service Vehicle (Individual Use)", "e-Rickshaw(P)", "Harvester", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cab", "Ambulance", "Recovery Vehicle", "Trailer (Agricultural)", "Dumper", "Trailer (Commercial)", 0, "Earth Moving Equipment", "Vehicle Fitted With Generator", "Camper Van / Trailer", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Animal Ambulance", "Semi-Trailer (Commercial)", "Tower Wagon", "Total"
FROM "Maker_Class_Wise_GJ27_2025";

INSERT INTO "Maker_Class_Wise_GJ27" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Fork Lift", "Agricultural Tractor", "Bus", "Vehicle Fitted With Rig", "Articulated Vehicle", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Moped", "Motorised Cycle (CC  25cc)", "Tractor (Commercial)", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Private Service Vehicle (Individual Use)", "e-Rickshaw(P)", "Harvester", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cab", "Ambulance", "Recovery Vehicle", "Trailer (Agricultural)", "Dumper", "Trailer (Commercial)", "Fire Fighting Vehicle", "Earth Moving Equipment", "Vehicle Fitted With Generator", "Camper Van / Trailer", "Motor Cycle/Scooter-Used For Hire", "Excavator (NT)", "Animal Ambulance", "Semi-Trailer (Commercial)", "Tower Wagon", "Total")
SELECT 2026, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Fork Lift", "Agricultural Tractor", "Bus", "Vehicle Fitted With Rig", "Articulated Vehicle", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw with Cart (G)", "Motor Car", "Moped", "Motorised Cycle (CC  25cc)", "Tractor (Commercial)", "Camper Van / Trailer (Private Use)", "Maxi Cab", "Private Service Vehicle (Individual Use)", "e-Rickshaw(P)", "Harvester", "Adapted Vehicle", "M-Cycle/Scooter-With Side Car", "Motor Cab", "Ambulance", "Recovery Vehicle", "Trailer (Agricultural)", "Dumper", "Trailer (Commercial)", "Fire Fighting Vehicle", 0, 0, 0, 0, 0, 0, 0, 0, "Total"
FROM "Maker_Class_Wise_GJ27_2026";

ALTER TABLE "Maker_Class_Wise_GJ27" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "Maker_Class_Wise_GJ27" TO anon, authenticated;

DROP POLICY IF EXISTS "anon read Maker_Class_Wise_GJ27" ON "Maker_Class_Wise_GJ27";

CREATE POLICY "anon read Maker_Class_Wise_GJ27" ON "Maker_Class_Wise_GJ27"
    FOR SELECT TO anon, authenticated USING (true);

DROP TABLE IF EXISTS "Maker_Class_Wise_GJ38";

CREATE TABLE "Maker_Class_Wise_GJ38" (
    "year"                                     smallint NOT NULL,
    "Maker"                                    text     NOT NULL,
    "Three Wheeler (Goods)"                    integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter"                          integer  NOT NULL DEFAULT 0,
    "Construction Equipment Vehicle"           integer  NOT NULL DEFAULT 0,
    "Crane Mounted Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Agricultural Tractor"                     integer  NOT NULL DEFAULT 0,
    "Trailer (Agricultural)"                   integer  NOT NULL DEFAULT 0,
    "Bus"                                      integer  NOT NULL DEFAULT 0,
    "Goods Carrier"                            integer  NOT NULL DEFAULT 0,
    "Three Wheeler (Passenger)"                integer  NOT NULL DEFAULT 0,
    "e-Rickshaw(P)"                            integer  NOT NULL DEFAULT 0,
    "Motor Car"                                integer  NOT NULL DEFAULT 0,
    "e-Rickshaw with Cart (G)"                 integer  NOT NULL DEFAULT 0,
    "Tractor (Commercial)"                     integer  NOT NULL DEFAULT 0,
    "Ambulance"                                integer  NOT NULL DEFAULT 0,
    "Maxi Cab"                                 integer  NOT NULL DEFAULT 0,
    "Omni Bus"                                 integer  NOT NULL DEFAULT 0,
    "Harvester"                                integer  NOT NULL DEFAULT 0,
    "Fork Lift"                                integer  NOT NULL DEFAULT 0,
    "Motor Cab"                                integer  NOT NULL DEFAULT 0,
    "M-Cycle/Scooter-With Side Car"            integer  NOT NULL DEFAULT 0,
    "Moped"                                    integer  NOT NULL DEFAULT 0,
    "Adapted Vehicle"                          integer  NOT NULL DEFAULT 0,
    "Fire Fighting Vehicle"                    integer  NOT NULL DEFAULT 0,
    "Recovery Vehicle"                         integer  NOT NULL DEFAULT 0,
    "Motorised Cycle (CC  25cc)"               integer  NOT NULL DEFAULT 0,
    "Dumper"                                   integer  NOT NULL DEFAULT 0,
    "Earth Moving Equipment"                   integer  NOT NULL DEFAULT 0,
    "Fire Tenders"                             integer  NOT NULL DEFAULT 0,
    "Private Service Vehicle (Individual Use)" integer  NOT NULL DEFAULT 0,
    "Educational Institution Bus"              integer  NOT NULL DEFAULT 0,
    "Road Roller"                              integer  NOT NULL DEFAULT 0,
    "Total"                                    integer  NOT NULL DEFAULT 0,
    PRIMARY KEY ("year", "Maker"),
    CHECK ("year" BETWEEN 2000 AND 2100)
);

INSERT INTO "Maker_Class_Wise_GJ38" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Trailer (Agricultural)", "Bus", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw(P)", "Motor Car", "e-Rickshaw with Cart (G)", "Tractor (Commercial)", "Ambulance", "Maxi Cab", "Omni Bus", "Harvester", "Fork Lift", "Motor Cab", "M-Cycle/Scooter-With Side Car", "Moped", "Adapted Vehicle", "Fire Fighting Vehicle", "Recovery Vehicle", "Motorised Cycle (CC  25cc)", "Dumper", "Earth Moving Equipment", "Fire Tenders", "Private Service Vehicle (Individual Use)", "Educational Institution Bus", "Road Roller", "Total")
SELECT 2025, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Trailer (Agricultural)", "Bus", "Goods Carrier", "Three Wheeler (Passenger)", 0, "Motor Car", "e-Rickshaw with Cart (G)", "Tractor (Commercial)", "Ambulance", "Maxi Cab", 0, "Harvester", "Fork Lift", "Motor Cab", "M-Cycle/Scooter-With Side Car", "Moped", "Adapted Vehicle", "Fire Fighting Vehicle", "Recovery Vehicle", "Motorised Cycle (CC  25cc)", "Dumper", "Earth Moving Equipment", "Fire Tenders", "Private Service Vehicle (Individual Use)", "Educational Institution Bus", "Road Roller", "Total"
FROM "Maker_Class_Wise_GJ38_2025";

INSERT INTO "Maker_Class_Wise_GJ38" ("year", "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Trailer (Agricultural)", "Bus", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw(P)", "Motor Car", "e-Rickshaw with Cart (G)", "Tractor (Commercial)", "Ambulance", "Maxi Cab", "Omni Bus", "Harvester", "Fork Lift", "Motor Cab", "M-Cycle/Scooter-With Side Car", "Moped", "Adapted Vehicle", "Fire Fighting Vehicle", "Recovery Vehicle", "Motorised Cycle (CC  25cc)", "Dumper", "Earth Moving Equipment", "Fire Tenders", "Private Service Vehicle (Individual Use)", "Educational Institution Bus", "Road Roller", "Total")
SELECT 2026, "Maker", "Three Wheeler (Goods)", "M-Cycle/Scooter", "Construction Equipment Vehicle", "Crane Mounted Vehicle", "Agricultural Tractor", "Trailer (Agricultural)", "Bus", "Goods Carrier", "Three Wheeler (Passenger)", "e-Rickshaw(P)", "Motor Car", "e-Rickshaw with Cart (G)", "Tractor (Commercial)", "Ambulance", "Maxi Cab", "Omni Bus", "Harvester", "Fork Lift", "Motor Cab", "M-Cycle/Scooter-With Side Car", "Moped", "Adapted Vehicle", "Fire Fighting Vehicle", "Recovery Vehicle", "Motorised Cycle (CC  25cc)", "Dumper", 0, 0, 0, 0, 0, "Total"
FROM "Maker_Class_Wise_GJ38_2026";

ALTER TABLE "Maker_Class_Wise_GJ38" ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE "Maker_Class_Wise_GJ38" TO anon, authenticated;

DROP POLICY IF EXISTS "anon read Maker_Class_Wise_GJ38" ON "Maker_Class_Wise_GJ38";

CREATE POLICY "anon read Maker_Class_Wise_GJ38" ON "Maker_Class_Wise_GJ38"
    FOR SELECT TO anon, authenticated USING (true);
