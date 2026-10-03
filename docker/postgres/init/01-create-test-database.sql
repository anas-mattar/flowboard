-- CL-E21: a second database on the same instance so integration tests never
-- truncate development data. Runs once, on first initialisation of the volume.
CREATE DATABASE flowboard_test OWNER flowboard;
