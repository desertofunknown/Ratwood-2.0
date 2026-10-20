#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
extern const char *bridge(uint32_t,const char **);
int main(void){const char *p=NULL; if(strcmp(bridge(1,NULL),"ERR|argv"))return 1; if(strcmp(bridge(1,&p),"ERR|null"))return 2; p="1|version"; if(strcmp(bridge(1,&p),"OK|1|echo"))return 3; puts("NATIVE_ABI_PASS");return 0;}
