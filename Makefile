NODE_GYP ?= node-gyp
BINDING ?= qwormhole

NATIVE_TARGET := build/Release/$(BINDING).node

.PHONY: all native clean

all: native

native: $(NATIVE_TARGET)

$(NATIVE_TARGET): binding.gyp c/qwormhole.cpp
	$(NODE_GYP) rebuild

clean:
	$(RM) -r build
