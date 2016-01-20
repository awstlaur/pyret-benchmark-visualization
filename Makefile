SHELL=/bin/bash -o pipefail

RSYNC    := rsync
RMAINFLAGS := -i -r
REXCLUDE := --exclude='Makefile' --exclude='builds/*' --exclude='.git*' --exclude='update*' --exclude='README*'
RPERMS   := --perms --chmod=Du+r,Du+w,Du+x,Dgo+r,Dgo+x,Fu+r,Fu+w,Fgo+r

RFLAGS   = $(RMAINFLAGS) $(REXCLUDE) $(RPERMS)

SOURCE    = $(shell pwd)
SITE     := /home/awstlaur/website/

.PHONY: get-builds
get-builds:
	./update_builds

.PHONY: push-site
push-site:
	$(RSYNC) $(RFLAGS) $(SOURCE) $(SITE)


NODE    = node
MODULES = node_modules/
JSHINT  = $(MODULES)jshint/bin/jshint
FILES   = visualize.js index.html
JSHINTFLAGS = --extract=auto
.PHONY: jshint
jshint:
	$(NODE) $(JSHINT) $(JSHINTFLAGS) $(FILES)