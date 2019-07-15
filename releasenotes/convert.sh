#!/bin/bash

for entry in old/*
do
    echo converting $entry
    python3 ../../../article-converter/converter.py $entry ${entry#'old/'}
done
