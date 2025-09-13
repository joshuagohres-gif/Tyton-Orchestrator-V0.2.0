import { storage } from "./storage";
import type { InsertComponent } from "@shared/schema";

const componentSeeds: InsertComponent[] = [
  // Microcontrollers
  {
    mpn: "ESP32-S3-WROOM-1",
    manufacturer: "Espressif",
    category: "microcontroller",
    name: "ESP32-S3",
    description: "Dual-core WiFi/BLE MCU with AI acceleration",
    footprint: "SMD-38",
    specifications: {
      voltage: "3.3V",
      current: "240mA",
      frequency: "240MHz",
      memory: "512KB SRAM",
      flash: "4MB",
      connectivity: ["WiFi", "Bluetooth"],
      gpio: 45,
      adc: "12-bit",
      dac: "8-bit"
    },
    pricing: {
      price: 4.50,
      currency: "USD",
      supplier: "Digi-Key"
    },
    datasheet: "https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf",
    symbol: "MCU"
  },
  {
    mpn: "ARDUINO_NANO_33_BLE",
    manufacturer: "Arduino",
    category: "microcontroller", 
    name: "Arduino Nano 33 BLE",
    description: "ARM Cortex-M4 with Bluetooth Low Energy",
    footprint: "THT-30",
    specifications: {
      voltage: "3.3V",
      current: "22mA",
      frequency: "64MHz",
      memory: "256KB RAM",
      flash: "1MB",
      connectivity: ["Bluetooth LE"],
      gpio: 14,
      adc: "12-bit",
      usb: "Micro-USB"
    },
    pricing: {
      price: 22.90,
      currency: "USD", 
      supplier: "Arduino Store"
    },
    datasheet: "https://docs.arduino.cc/hardware/nano-33-ble",
    symbol: "MCU"
  },
  {
    mpn: "ATMEGA328P-PU",
    manufacturer: "Microchip",
    category: "microcontroller",
    name: "ATmega328P",
    description: "8-bit AVR microcontroller (Arduino Uno compatible)",
    footprint: "DIP-28",
    specifications: {
      voltage: "5V",
      current: "1.5mA",
      frequency: "16MHz",
      memory: "2KB SRAM",
      flash: "32KB",
      eeprom: "1KB",
      gpio: 23,
      adc: "10-bit",
      timers: 3
    },
    pricing: {
      price: 3.20,
      currency: "USD",
      supplier: "Mouser"
    },
    datasheet: "https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf",
    symbol: "MCU"
  },

  // Sensors
  {
    mpn: "DHT22",
    manufacturer: "Aosong",
    category: "sensor",
    name: "DHT22",
    description: "Digital temperature and humidity sensor",
    footprint: "THT-4",
    specifications: {
      voltage: "3.3V-6V",
      current: "2.5mA",
      temperature_range: "-40°C to 80°C",
      humidity_range: "0-100% RH",
      accuracy_temp: "±0.5°C",
      accuracy_humidity: "±2-5% RH",
      interface: "Single-wire digital",
      response_time: "2s"
    },
    pricing: {
      price: 9.95,
      currency: "USD",
      supplier: "AdaFruit"
    },
    datasheet: "https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf",
    symbol: "SENSOR"
  },
  {
    mpn: "HC-SR501",
    manufacturer: "Generic",
    category: "sensor",
    name: "PIR Motion Sensor",
    description: "Passive infrared motion detection sensor",
    footprint: "THT-3",
    specifications: {
      voltage: "5V-20V",
      current: "65mA",
      detection_range: "7m",
      detection_angle: "120°",
      delay_time: "5s-300s",
      blocking_time: "2.5s",
      interface: "Digital output",
      sensitivity: "Adjustable"
    },
    pricing: {
      price: 2.50,
      currency: "USD", 
      supplier: "Amazon"
    },
    datasheet: "https://www.mpja.com/download/31227sc.pdf",
    symbol: "SENSOR"
  },
  {
    mpn: "BME280",
    manufacturer: "Bosch",
    category: "sensor",
    name: "BME280",
    description: "Environmental sensor (temperature, humidity, pressure)",
    footprint: "LGA-8",
    specifications: {
      voltage: "1.71V-3.6V",
      current: "3.4µA",
      temperature_range: "-40°C to 85°C",
      humidity_range: "0-100% RH",
      pressure_range: "300-1100 hPa",
      accuracy_temp: "±1°C",
      accuracy_humidity: "±3% RH",
      accuracy_pressure: "±1 hPa",
      interface: "I2C/SPI"
    },
    pricing: {
      price: 6.95,
      currency: "USD",
      supplier: "Digi-Key"
    },
    datasheet: "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
    symbol: "SENSOR"
  },

  // Communication Modules
  {
    mpn: "ESP8266-12F",
    manufacturer: "Espressif",
    category: "communication",
    name: "ESP8266 WiFi Module",
    description: "Low-cost WiFi microchip with TCP/IP stack",
    footprint: "SMD-22",
    specifications: {
      voltage: "3.3V",
      current: "170mA",
      frequency: "80MHz",
      memory: "80KB RAM",
      flash: "4MB",
      wifi: "802.11 b/g/n",
      security: "WPA/WPA2",
      gpio: 17,
      adc: "10-bit"
    },
    pricing: {
      price: 3.20,
      currency: "USD",
      supplier: "AliExpress"
    },
    datasheet: "https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf",
    symbol: "COMM"
  },
  {
    mpn: "HC-05",
    manufacturer: "Generic",
    category: "communication",
    name: "HC-05 Bluetooth Module",
    description: "Bluetooth SPP (Serial Port Protocol) module",
    footprint: "THT-6",
    specifications: {
      voltage: "3.3V-6V",
      current: "30mA",
      bluetooth: "v2.0+EDR",
      frequency: "2.4GHz",
      range: "10m",
      baud_rate: "9600-1382400",
      interface: "UART",
      pairing: "Auto-connect"
    },
    pricing: {
      price: 5.99,
      currency: "USD",
      supplier: "SparkFun"
    },
    datasheet: "https://components101.com/sites/default/files/component_datasheet/HC-05%20Datasheet.pdf",
    symbol: "COMM"
  },
  {
    mpn: "NRF24L01+",
    manufacturer: "Nordic",
    category: "communication",
    name: "nRF24L01+ Transceiver",
    description: "2.4GHz wireless transceiver with enhanced ShockBurst",
    footprint: "QFN-20",
    specifications: {
      voltage: "1.9V-3.6V",
      current: "13.5mA",
      frequency: "2.4GHz",
      data_rate: "2Mbps",
      range: "100m",
      channels: 125,
      interface: "SPI",
      power: "-18dBm to 0dBm"
    },
    pricing: {
      price: 1.95,
      currency: "USD",
      supplier: "Digi-Key"
    },
    datasheet: "https://www.nordicsemi.com/eng/content/download/2730/34105/file/nRF24L01+_Product_Specification_v1_0.pdf",
    symbol: "COMM"
  },

  // Power Management
  {
    mpn: "AMS1117-3.3",
    manufacturer: "Advanced Monolithic Systems",
    category: "power",
    name: "AMS1117 3.3V Regulator",
    description: "Low dropout linear voltage regulator",
    footprint: "SOT-223",
    specifications: {
      input_voltage: "4.75V-15V",
      output_voltage: "3.3V",
      current: "1A",
      dropout: "1.3V",
      accuracy: "±1%",
      thermal_protection: true,
      current_limiting: true,
      package: "SOT-223"
    },
    pricing: {
      price: 0.85,
      currency: "USD",
      supplier: "LCSC"
    },
    datasheet: "http://www.advanced-monolithic.com/pdf/ds1117.pdf",
    symbol: "REG"
  },
  {
    mpn: "LM2596S-3.3",
    manufacturer: "Texas Instruments",
    category: "power",
    name: "LM2596 Buck Converter",
    description: "3A step-down switching regulator",
    footprint: "TO-263",
    specifications: {
      input_voltage: "4.5V-40V",
      output_voltage: "3.3V",
      current: "3A",
      efficiency: "92%",
      switching_freq: "150kHz",
      thermal_protection: true,
      overcurrent_protection: true,
      package: "TO-263"
    },
    pricing: {
      price: 2.15,
      currency: "USD",
      supplier: "Mouser"
    },
    datasheet: "https://www.ti.com/lit/ds/symlink/lm2596.pdf",
    symbol: "REG"
  },

  // Passive Components
  {
    mpn: "0805-10K",
    manufacturer: "Generic",
    category: "passive",
    name: "10kΩ Resistor",
    description: "0805 SMD resistor, 1% tolerance",
    footprint: "0805",
    specifications: {
      resistance: "10000",
      tolerance: "1%",
      power: "0.125W",
      temperature_coeff: "100ppm/°C",
      package: "0805",
      voltage_rating: "150V"
    },
    pricing: {
      price: 0.02,
      currency: "USD",
      supplier: "Digi-Key"
    },
    datasheet: "",
    symbol: "R"
  },
  {
    mpn: "0805-100nF",
    manufacturer: "Generic", 
    category: "passive",
    name: "100nF Capacitor",
    description: "0805 SMD ceramic capacitor, X7R",
    footprint: "0805",
    specifications: {
      capacitance: "100nF",
      voltage_rating: "50V",
      tolerance: "10%",
      dielectric: "X7R",
      package: "0805",
      temperature_coeff: "±15%"
    },
    pricing: {
      price: 0.05,
      currency: "USD",
      supplier: "Digi-Key"
    },
    datasheet: "",
    symbol: "C"
  }
];

export async function seedComponents() {
  console.log("Starting component seeding...");
  
  try {
    for (const component of componentSeeds) {
      // Check if component already exists
      const existing = await storage.searchComponents(component.mpn);
      
      if (existing.length === 0) {
        await storage.createComponent(component);
        console.log(`✓ Created component: ${component.name} (${component.mpn})`);
      } else {
        console.log(`- Component already exists: ${component.name} (${component.mpn})`);
      }
    }
    
    console.log(`Component seeding completed. ${componentSeeds.length} components processed.`);
  } catch (error) {
    console.error("Error seeding components:", error);
    throw error;
  }
}

// Auto-run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedComponents()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
