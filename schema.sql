-- Declare a variable to store the entity_schema value
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  -- Retrieve the entity_schema value using the SELECT query
  	SELECT information.schema_name
	INTO schema_name
	FROM information_schema.schemata as information
	WHERE information.schema_name LIKE 'dcl' || '%'
	ORDER BY CAST(SUBSTRING(information.schema_name FROM 'dcl([0-9]+)') AS INTEGER) 
	desc LIMIT 1;

  -- Set the current working schema using the retrieved entity_schema value
  EXECUTE 'SET search_path TO ' || schema_name;

  -- Output the current working schema
  RAISE NOTICE 'Current working schema set to: %', schema_name;
END $$;

CREATE TABLE collections (
	id TEXT NOT NULL PRIMARY KEY,
	creator TEXT NOT NULL,
	is_approved BOOLEAN NOT NULL DEFAULT false,
	name TEXT NOT NULL,
	symbol TEXT NOT NULL,
	owner TEXT NOT NULL,
	is_completed BOOLEAN NOT NULL DEFAULT false,
	created_at INTEGER NOT NULL
);
create TABLE items (
	id TEXT NOT NULL PRIMARY KEY,
	blockchain_item_id BigInt NOT NULL,
	item_type TEXT NOT NULL,
	price TEXT NOT NULL,
	total_supply TEXT NOT NULL,
	available TEXT NOT NULL,
	max_supply TEXT NOT NULL,
	rarity TEXT NOT NULL,
	beneficiary TEXT NOT NULL,
	raw_metadata TEXT NOT NULL,
	collection_id TEXT NOT NULL,
	created_at INTEGER NOT NULL -- CONSTRAINT fk_collection FOREIGN KEY(collection_id) REFERENCES collections(id)
);
CREATE TABLE orders (
	id TEXT NOT NULL PRIMARY KEY,
	marketplace_address TEXT NOT NULL,
	nft_id TEXT NOT NULL,
	token_id TEXT NOT NULL,
	tx_hash TEXT NOT NULL,
	owner TEXT NOT NULL,
	buyer TEXT,
	price TEXT NOT NULL,
	status TEXT NOT NULL,
	block_number TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE TABLE nfts (
	id TEXT NOT NULL PRIMARY KEY,
	token_id TEXT NOT NULL,
	collection_id TEXT NOT NULL,
	issued_id TEXT NOT NULL,
	item_id TEXT NOT NULL,
	owner TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);