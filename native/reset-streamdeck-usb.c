#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/usb/IOUSBLib.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

enum {
  STREAM_DECK_VENDOR_ID = 4057,
  STREAM_DECK_MK2_PRODUCT_ID = 128,
};

static int number_property(io_service_t service, CFStringRef key, int *value) {
  CFTypeRef property = IORegistryEntryCreateCFProperty(
      service, key, kCFAllocatorDefault, 0);
  if (!property || CFGetTypeID(property) != CFNumberGetTypeID()) {
    if (property) CFRelease(property);
    return 0;
  }
  int result = 0;
  const Boolean ok = CFNumberGetValue(
      (CFNumberRef)property, kCFNumberIntType, &result);
  CFRelease(property);
  if (!ok) return 0;
  *value = result;
  return 1;
}

static int serial_matches(io_service_t service, const char *wanted) {
  CFTypeRef property = IORegistryEntryCreateCFProperty(
      service, CFSTR("USB Serial Number"), kCFAllocatorDefault, 0);
  if (!property || CFGetTypeID(property) != CFStringGetTypeID()) {
    if (property) CFRelease(property);
    return 0;
  }
  char serial[256] = {0};
  const Boolean ok = CFStringGetCString(
      (CFStringRef)property, serial, sizeof(serial), kCFStringEncodingUTF8);
  CFRelease(property);
  return ok && strcmp(serial, wanted) == 0;
}

static int reset_device(io_service_t service) {
  IOCFPlugInInterface **plugin = NULL;
  IOUSBDeviceInterface187 **device = NULL;
  SInt32 score = 0;
  IOReturn result = IOCreatePlugInInterfaceForService(
      service,
      kIOUSBDeviceUserClientTypeID,
      kIOCFPlugInInterfaceID,
      &plugin,
      &score);
  if (result != kIOReturnSuccess || !plugin) {
    fprintf(stderr, "USB interface creation failed: 0x%08x\n", result);
    return 1;
  }

  const HRESULT query = (*plugin)->QueryInterface(
      plugin,
      CFUUIDGetUUIDBytes(kIOUSBDeviceInterfaceID187),
      (LPVOID *)&device);
  (*plugin)->Release(plugin);
  if (query || !device) {
    fprintf(stderr, "USB device interface query failed: 0x%08x\n", query);
    return 1;
  }

  result = (*device)->USBDeviceOpenSeize(device);
  if (result != kIOReturnSuccess) {
    fprintf(stderr, "USB device seize failed: 0x%08x\n", result);
    (*device)->Release(device);
    return 1;
  }

  result = (*device)->USBDeviceReEnumerate(device, 0);
  if (result != kIOReturnSuccess && result != kIOReturnNoDevice) {
    fprintf(stderr, "USB device re-enumeration failed: 0x%08x\n", result);
    (*device)->USBDeviceClose(device);
    (*device)->Release(device);
    return 1;
  }

  (*device)->Release(device);
  puts("Stream Deck USB device re-enumerated.");
  return 0;
}

int main(int argc, char **argv) {
  if (argc != 2 || strlen(argv[1]) == 0) {
    fprintf(stderr, "usage: %s STREAM_DECK_SERIAL\n", argv[0]);
    return 2;
  }

  CFMutableDictionaryRef matching = IOServiceMatching("IOUSBHostDevice");
  if (!matching) return 1;

  io_iterator_t iterator = IO_OBJECT_NULL;
  IOReturn result = IOServiceGetMatchingServices(
      kIOMainPortDefault, matching, &iterator);
  if (result != kIOReturnSuccess) {
    fprintf(stderr, "USB enumeration failed: 0x%08x\n", result);
    return 1;
  }

  io_service_t match = IO_OBJECT_NULL;
  unsigned matches = 0;
  io_service_t service;
  while ((service = IOIteratorNext(iterator))) {
    int vendor = 0;
    int product = 0;
    if (number_property(service, CFSTR("idVendor"), &vendor) &&
        number_property(service, CFSTR("idProduct"), &product) &&
        vendor == STREAM_DECK_VENDOR_ID &&
        product == STREAM_DECK_MK2_PRODUCT_ID &&
        serial_matches(service, argv[1])) {
      matches++;
      if (match) IOObjectRelease(match);
      match = service;
    } else {
      IOObjectRelease(service);
    }
  }
  IOObjectRelease(iterator);

  if (matches != 1 || !match) {
    fprintf(stderr, "Expected one exact Stream Deck MK.2, found %u.\n", matches);
    if (match) IOObjectRelease(match);
    return 1;
  }

  const int status = reset_device(match);
  IOObjectRelease(match);
  return status;
}
