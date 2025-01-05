// schema.js
export const dbSchema = {
    tables: {
      customers: {
        columns: {
          customer_id: { type: 'UUID', isPrimary: true },
          name: { type: 'VARCHAR(100)', isRequired: true },
          email: { type: 'VARCHAR(255)', isRequired: true, isUnique: true },
          phone: { type: 'VARCHAR(20)' },
          address: { type: 'TEXT', isRequired: true },
          created_at: { type: 'TIMESTAMP WITH TIME ZONE' }
        }
      },
      drivers: {
        columns: {
          driver_id: { type: 'UUID', isPrimary: true },
          name: { type: 'VARCHAR(100)', isRequired: true },
          email: { type: 'VARCHAR(255)', isRequired: true, isUnique: true },
          phone: { type: 'VARCHAR(20)', isRequired: true },
          vehicle_type: { type: 'VARCHAR(50)' },
          license_number: { type: 'VARCHAR(50)', isRequired: true },
          status: { 
            type: 'VARCHAR(20)', 
            enum: ['available', 'busy', 'offline']
          },
          created_at: { type: 'TIMESTAMP WITH TIME ZONE' }
        }
      },
      deliveries: {
        columns: {
          delivery_id: { type: 'UUID', isPrimary: true },
          customer_id: { 
            type: 'UUID', 
            isRequired: true,
            references: {
              table: 'customers',
              column: 'customer_id'
            }
          },
          driver_id: { 
            type: 'UUID', 
            references: {
              table: 'drivers',
              column: 'driver_id'
            }
          },
          pickup_address: { type: 'TEXT', isRequired: true },
          delivery_address: { type: 'TEXT', isRequired: true },
          status: { 
            type: 'VARCHAR(20)', 
            enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled']
          },
          created_at: { type: 'TIMESTAMP WITH TIME ZONE' },
          pickup_time: { type: 'TIMESTAMP WITH TIME ZONE' },
          delivered_time: { type: 'TIMESTAMP WITH TIME ZONE' },
          package_description: { type: 'TEXT' },
          delivery_notes: { type: 'TEXT' }
        }
      }
    }
  };